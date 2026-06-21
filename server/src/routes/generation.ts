import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { store } from '../SessionStore.js';
import { enqueueGenerationJobs, subscribeSSE, generateRoomPanorama } from '../queue.js';

const router = Router({ mergeParams: true });
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');

// 5.2 Trigger generation
router.post('/', async (req: Request, res: Response) => {
  const sessionId = req.params.id;
  console.log(`[Generation] POST /generate — session=${sessionId}`);
  try {
    const jobs = await enqueueGenerationJobs(sessionId);
    console.log(`[Generation] enqueued ${jobs.length} job(s) for session=${sessionId}`);
    res.json({ jobs });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    console.error(`[Generation] enqueue failed — session=${sessionId}:`, (err as Error).message);
    res.status(status).json({ error: (err as Error).message });
  }
});

// Trigger World Labs panorama for all done jobs that are missing panoramas
router.post('/generate-panoramas', async (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const session = await store.read(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const eligible = session.jobs.filter((j) => j.status === 'done' && !j.panoramaUrl);
  console.log(`[Generation] generate-panoramas — session=${sessionId} eligible=${eligible.length}`);

  for (const job of eligible) {
    const room = session.rooms.find((r) => r.id === job.roomId);
    if (!room) continue;
    const photo = room.photos.find((p) => p.id === room.primaryPhotoId);
    if (!photo) continue;
    const photoPath = path.join(DATA_DIR, 'sessions', sessionId, 'photos', room.id, photo.filename);
    const outputDir = path.join(DATA_DIR, 'sessions', sessionId, 'panorama', room.id);
    console.log(`[Generation] queuing panorama for job=${job.id} room="${room.label}"`);
    generateRoomPanorama(sessionId, job.id, room.id, room.label, photoPath, outputDir)
      .catch((err) => console.error(`[WorldLabs] panorama failed job=${job.id}:`, err));
  }

  res.json({ queued: eligible.length });
});

// 5.8 Get all jobs
router.get('/jobs', async (req: Request, res: Response) => {
  const session = await store.read(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session.jobs);
});

// 5.7 SSE event stream
router.get('/events', async (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const session = await store.read(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  const unsubscribe = subscribeSSE(sessionId, send);
  console.log(`[SSE] client connected — session=${sessionId}`);

  // Send current job states immediately
  const current = await store.read(sessionId);
  if (current?.jobs.length) {
    console.log(`[SSE] replaying ${current.jobs.length} existing job(s) to new client`);
    for (const job of current.jobs) {
      send(JSON.stringify({ type: 'job-update', job }));
    }
  }

  req.on('close', () => {
    console.log(`[SSE] client disconnected — session=${sessionId}`);
    unsubscribe();
  });
});

// Serve generated asset files
router.get('/assets/:roomId/:filename', async (req: Request, res: Response) => {
  const { id: sessionId, roomId, filename } = req.params;
  const assetPath = path.join(DATA_DIR, 'sessions', sessionId, 'assets', roomId, filename);
  try {
    await fs.access(assetPath);
    res.sendFile(assetPath);
  } catch {
    res.status(404).json({ error: 'Asset not found' });
  }
});

export default router;
