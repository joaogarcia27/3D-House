import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import path from 'path';
import { store } from './SessionStore.js';
import { RoomEnvironmentService } from './RoomEnvironmentService.js';
import { FloorPlanFurnitureService } from './FloorPlanFurnitureService.js';
import { DepthEstimationService } from './DepthEstimationService.js';
import { WorldLabsService } from './WorldLabsService.js';
import { GenerationJob } from './types.js';

// Strip parenthetical translations like "(Living Room + Kitchen)" so that
// "Sala + Kitchenette (Living Room + Kitchen)" matches "Sala + Kitchenette"
function normalizeRoomLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let generationQueue: Queue | null = null;

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');

// SSE subscribers: sessionId -> set of response write functions
const sseSubscribers = new Map<string, Set<(data: string) => void>>();

export function subscribeSSE(sessionId: string, cb: (data: string) => void): () => void {
  if (!sseSubscribers.has(sessionId)) sseSubscribers.set(sessionId, new Set());
  sseSubscribers.get(sessionId)!.add(cb);
  return () => {
    sseSubscribers.get(sessionId)?.delete(cb);
  };
}

function emitJobUpdate(sessionId: string, job: GenerationJob) {
  const payload = JSON.stringify({ type: 'job-update', job });
  sseSubscribers.get(sessionId)?.forEach((cb) => cb(payload));
}

async function updateJobStatus(
  sessionId: string,
  jobId: string,
  updates: Partial<GenerationJob>
): Promise<GenerationJob> {
  const session = await store.update(sessionId, (s) => ({
    ...s,
    jobs: s.jobs.map((j) =>
      j.id === jobId ? { ...j, ...updates, updatedAt: new Date().toISOString() } : j
    ),
  }));
  const job = session.jobs.find((j) => j.id === jobId)!;
  emitJobUpdate(sessionId, job);
  return job;
}

async function processJob(
  sessionId: string,
  jobId: string,
  roomId: string,
  photoPath: string
): Promise<void> {
  console.log(`[Queue] processJob start — job=${jobId} room=${roomId} photo=${photoPath}`);
  await updateJobStatus(sessionId, jobId, { status: 'analysing' });
  try {
    const session = await store.read(sessionId);
    const room = session?.rooms.find((r) => r.id === roomId);

    const floorPlanPath = session?.floorPlan
      ? path.join(DATA_DIR, 'sessions', sessionId, 'floor-plan', session.floorPlan.imageFilename)
      : null;
    console.log(`[Queue] floor plan path: ${floorPlanPath ?? '(none)'}`);

    const depthOutputDir = path.join(DATA_DIR, 'sessions', sessionId, 'depth', roomId);

    const [furniture, allFloorFurniture, depthFilename] = await Promise.all([
      new RoomEnvironmentService().analyzeRoomObjects(photoPath),
      floorPlanPath
        ? new FloorPlanFurnitureService().extractFurnitureLayout(floorPlanPath)
        : Promise.resolve([]),
      new DepthEstimationService().getDepthMap(photoPath, depthOutputDir, jobId),
    ]);

    const roomLabel = room?.label ?? '';
    const floorPlanFurniture = allFloorFurniture.filter(
      (f) => normalizeRoomLabel(f.roomLabel) === normalizeRoomLabel(roomLabel)
    );

    const depthMapUrl = depthFilename
      ? `/data/sessions/${sessionId}/depth/${roomId}/${depthFilename}`
      : undefined;

    console.log(
      `[Queue] processJob done — job=${jobId} room="${roomLabel}"` +
      ` furniture=${furniture.length} floorFurniture=${floorPlanFurniture.length}/${allFloorFurniture.length}` +
      ` depthMap=${depthMapUrl ?? '(none)'}`
    );

    await updateJobStatus(sessionId, jobId, {
      status: 'done',
      furniture,
      floorPlanFurniture,
      depthMapUrl,
    });

    // Background: World Labs panorama (~5 min). Updates job via SSE when ready.
    const panoramaOutputDir = path.join(DATA_DIR, 'sessions', sessionId, 'panorama', roomId);
    generateRoomPanorama(sessionId, jobId, roomId, roomLabel, photoPath, panoramaOutputDir)
      .catch((err) => console.error(`[WorldLabs] background panorama failed job=${jobId}:`, err));
  } catch (err) {
    console.error(`[Queue] processJob failed — job=${jobId}:`, err);
    await updateJobStatus(sessionId, jobId, { status: 'failed', error: (err as Error).message });
  }
}

export async function generateRoomPanorama(
  sessionId: string,
  jobId: string,
  roomId: string,
  roomLabel: string,
  photoPath: string,
  outputDir: string
): Promise<void> {
  const result = await new WorldLabsService().generatePanorama(photoPath, roomLabel, outputDir, jobId);
  if (!result) return;
  const panoramaUrl = `/data/sessions/${sessionId}/panorama/${roomId}/${result.panoramaFilename}`;
  const splatUrl = result.splatFilename
    ? `/data/sessions/${sessionId}/panorama/${roomId}/${result.splatFilename}`
    : undefined;
  console.log(`[WorldLabs] panorama ready — job=${jobId}: ${panoramaUrl}`);
  if (splatUrl) console.log(`[WorldLabs] splat ready — job=${jobId}: ${splatUrl}`);
  await updateJobStatus(sessionId, jobId, { panoramaUrl, ...(splatUrl ? { splatUrl } : {}) });
}

export async function initQueue(): Promise<Queue | null> {
  if (process.env.GENERATION_MODE === 'mock') return null;

  try {
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    await connection.connect().catch((err: Error) => { throw err; });

    generationQueue = new Queue('room-generation', { connection });

    const workerConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false });
    workerConn.on('error', () => {});

    new Worker(
      'room-generation',
      async (job) => {
        const { sessionId, roomId, jobId, photoPath } = job.data as {
          sessionId: string; roomId: string; jobId: string; photoPath: string;
        };
        await processJob(sessionId, jobId, roomId, photoPath);
      },
      { connection: workerConn, concurrency: 3 }
    );

    return generationQueue;
  } catch (err) {
    console.warn('Redis unavailable, falling back to in-process mode:', err);
    return null;
  }
}

export async function enqueueGenerationJobs(sessionId: string): Promise<GenerationJob[]> {
  const session = await store.read(sessionId);
  if (!session) throw new Error('Session not found');

  const { v4: uuidv4 } = await import('uuid');
  const eligible = session.rooms.filter((r) => r.photos.length > 0 && r.primaryPhotoId);
  console.log(`[Queue] enqueue — session=${sessionId} eligible rooms=${eligible.map((r) => r.label).join(', ') || '(none)'}`);

  if (eligible.length === 0) {
    throw Object.assign(new Error('No rooms have photos'), { status: 422 });
  }

  // Skip rooms that already have a complete job with a depth map.
  // Re-queue rooms that are done but missing a depth map, or that failed.
  const toProcess = eligible.filter((room) => {
    const existing = session.jobs
      .filter((j) => j.roomId === room.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!existing) return true;
    if (existing.status === 'failed') return true;
    if (existing.status === 'done' && !existing.depthMapUrl) {
      console.log(`[Queue] re-queuing room="${room.label}" — done but missing depth map`);
      return true;
    }
    if (existing.status === 'done' && existing.depthMapUrl) {
      console.log(`[Queue] skipping room="${room.label}" — already complete${existing.panoramaUrl ? ' (panorama ready)' : ' (panorama pending)'}`);
      return false;
    }
    // queued or analysing — already in flight
    console.log(`[Queue] skipping room="${room.label}" — job already ${existing.status}`);
    return false;
  });

  if (toProcess.length === 0) {
    console.log('[Queue] all rooms already processed — nothing to enqueue');
    return [];
  }

  const now = new Date().toISOString();
  const newJobs: GenerationJob[] = toProcess.map((r) => ({
    id: uuidv4(),
    sessionId,
    roomId: r.id,
    primaryPhotoUrl: r.photos.find((p) => p.id === r.primaryPhotoId)!.fileUrl,
    status: 'queued' as const,
    createdAt: now,
    updatedAt: now,
  }));

  await store.update(sessionId, (s) => ({ ...s, jobs: [...s.jobs, ...newJobs] }));

  const mode = generationQueue ? 'redis' : 'in-process';
  console.log(`[Queue] dispatching ${newJobs.length} job(s) via ${mode}`);

  for (const job of newJobs) {
    const room = toProcess.find((r) => r.id === job.roomId)!;
    const photo = room.photos.find((p) => p.id === room.primaryPhotoId)!;
    const photoPath = path.join(DATA_DIR, 'sessions', sessionId, 'photos', room.id, photo.filename);
    console.log(`[Queue] dispatching job=${job.id} room="${room.label}" photo=${photo.filename}`);

    if (generationQueue) {
      await generationQueue.add('generate', { sessionId, roomId: job.roomId, jobId: job.id, photoPath });
    } else {
      // Run in-process (no Redis or mock mode)
      processJob(sessionId, job.id, job.roomId, photoPath).catch(console.error);
    }
  }

  return newJobs;
}
