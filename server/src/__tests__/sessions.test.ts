import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import express from 'express';
import cors from 'cors';
import sessionsRouter from '../routes/sessions.js';
import roomsRouter from '../routes/rooms.js';
import generationRouter from '../routes/generation.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walkthrough-test-'));
process.env.DATA_DIR = tmpDir;
process.env.GENERATION_MODE = 'mock';
process.env.ANTHROPIC_API_KEY = 'test-key';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions/:id/rooms', roomsRouter);
app.use('/api/sessions/:id/generate', generationRouter);
app.use('/api/sessions/:id', generationRouter);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/sessions', () => {
  it('creates a session and returns sessionId', async () => {
    const res = await request(app).post('/api/sessions').expect(201);
    expect(res.body.sessionId).toBeDefined();
    expect(typeof res.body.sessionId).toBe('string');
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns 404 for unknown session', async () => {
    await request(app).get('/api/sessions/nonexistent-id').expect(404);
  });

  it('returns the session after creation', async () => {
    const create = await request(app).post('/api/sessions').expect(201);
    const { sessionId } = create.body;
    const get = await request(app).get(`/api/sessions/${sessionId}`).expect(200);
    expect(get.body.id).toBe(sessionId);
    expect(get.body.rooms).toEqual([]);
  });
});

describe('POST /api/sessions/:id/rooms — manual room', () => {
  it('adds a room with a label', async () => {
    const { body: { sessionId } } = await request(app).post('/api/sessions').expect(201);
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/rooms`)
      .send({ label: 'Kitchen' })
      .expect(201);
    expect(res.body.label).toBe('Kitchen');
    expect(res.body.id).toBeDefined();
  });

  it('rejects room creation without label', async () => {
    const { body: { sessionId } } = await request(app).post('/api/sessions').expect(201);
    await request(app)
      .post(`/api/sessions/${sessionId}/rooms`)
      .send({})
      .expect(400);
  });
});

describe('POST /api/sessions/:id/rooms/:roomId/photos', () => {
  it('uploads a photo and sets it as primary', async () => {
    const { body: { sessionId } } = await request(app).post('/api/sessions').expect(201);
    const { body: room } = await request(app)
      .post(`/api/sessions/${sessionId}/rooms`)
      .send({ label: 'Bedroom' })
      .expect(201);

    // Create a minimal JPEG test fixture (1x1 pixel)
    const testImgPath = path.join(tmpDir, 'test.jpg');
    // Minimal valid JPEG bytes
    const jpegBytes = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffffc000110800010001030122003211000321100ffda000c03010002110311003f00f80c8000ffda0003010011003f00fc7ffe0fffd9',
      'hex'
    );
    fs.writeFileSync(testImgPath, jpegBytes);

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/rooms/${room.id}/photos`)
      .attach('file', testImgPath, { contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body.photos).toHaveLength(1);
    expect(res.body.primaryPhotoId).toBe(res.body.photos[0].id);
  });
});

describe('POST /api/sessions/:id/generate (mock mode)', () => {
  it('returns 422 if no rooms have photos', async () => {
    const { body: { sessionId } } = await request(app).post('/api/sessions').expect(201);
    await request(app).post(`/api/sessions/${sessionId}/rooms`).send({ label: 'Kitchen' });
    await request(app)
      .post(`/api/sessions/${sessionId}/generate`)
      .expect(422);
  });

  it('enqueues mock jobs and they complete within 15s', async () => {
    const { body: { sessionId } } = await request(app).post('/api/sessions').expect(201);
    const { body: room } = await request(app)
      .post(`/api/sessions/${sessionId}/rooms`)
      .send({ label: 'Living Room' })
      .expect(201);

    const testImgPath = path.join(tmpDir, 'test.jpg');
    if (!fs.existsSync(testImgPath)) {
      const jpegBytes = Buffer.from(
        'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffffc000110800010001030122003211000321100ffda000c03010002110311003f00f80c8000ffda0003010011003f00fc7ffe0fffd9',
        'hex'
      );
      fs.writeFileSync(testImgPath, jpegBytes);
    }

    await request(app)
      .post(`/api/sessions/${sessionId}/rooms/${room.id}/photos`)
      .attach('file', testImgPath, { contentType: 'image/jpeg' });

    const genRes = await request(app)
      .post(`/api/sessions/${sessionId}/generate`)
      .expect(200);
    expect(genRes.body.jobs).toHaveLength(1);
    expect(genRes.body.jobs[0].status).toBe('queued');

    // Poll until done or 15s
    const start = Date.now();
    let done = false;
    while (Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 1000));
      const jobsRes = await request(app).get(`/api/sessions/${sessionId}/jobs`).expect(200);
      const jobs = jobsRes.body as Array<{ status: string; glbUrl?: string }>;
      if (jobs.every((j) => ['done', 'partial_done', 'failed'].includes(j.status))) {
        done = true;
        const completedJob = jobs[0];
        expect(['done', 'partial_done'].includes(completedJob.status)).toBe(true);
        break;
      }
    }
    expect(done).toBe(true);
  }, 20000);
});
