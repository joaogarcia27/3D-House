import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { store } from '../SessionStore.js';
import { photoUpload } from '../upload.js';
import { Photo } from '../types.js';

const router = Router({ mergeParams: true });
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');

// 4.1 Replace full room list
router.put('/', async (req: Request, res: Response) => {
  const session = await store.read(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const rooms = req.body?.rooms;
  if (!Array.isArray(rooms)) return res.status(400).json({ error: 'rooms array required' });

  for (const r of rooms) {
    if (!r.id || !r.label?.trim())
      return res.status(400).json({ error: `Room missing id or label` });
  }

  const updated = await store.update(req.params.id, (s) => ({ ...s, rooms }));
  res.json(updated.rooms);
});

// 4.2 Add manual room
router.post('/', async (req: Request, res: Response) => {
  const session = await store.read(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const label = req.body?.label?.trim();
  if (!label) return res.status(400).json({ error: 'label required' });

  const room = {
    id: uuidv4(),
    label,
    geometry: null,
    confidence: 1,
    widthM: null,
    heightM: null,
    doors: [],
    windows: [],
    photos: [],
    primaryPhotoId: null,
  };

  await store.update(req.params.id, (s) => ({ ...s, rooms: [...s.rooms, room] }));
  res.status(201).json(room);
});

// 4.3 Delete room
router.delete('/:roomId', async (req: Request, res: Response) => {
  const { id: sessionId, roomId } = req.params;
  const session = await store.read(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const photoDir = path.join(DATA_DIR, 'sessions', sessionId, 'photos', roomId);
  try { await fs.rm(photoDir, { recursive: true, force: true }); } catch {}

  await store.update(sessionId, (s) => ({
    ...s,
    rooms: s.rooms.filter((r) => r.id !== roomId),
  }));
  res.status(204).send();
});

// 4.4 Upload photo to room
router.post(
  '/:roomId/photos',
  (req: Request, res: Response, next: NextFunction) => {
    photoUpload.single('file')(req, res, (err) => {
      if (err) {
        const status = (err as { status?: number }).status ?? 500;
        return res.status(status).json({ error: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const { id: sessionId, roomId } = req.params;
    const session = await store.read(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const photoId = uuidv4();
    const photo: Photo = {
      id: photoId,
      roomId,
      filename: file.filename,
      fileUrl: `/api/sessions/${sessionId}/rooms/${roomId}/photos/${photoId}/image`,
      uploadedAt: new Date().toISOString(),
    };

    const updated = await store.update(sessionId, (s) => ({
      ...s,
      rooms: s.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const photos = [...r.photos, photo];
        return {
          ...r,
          photos,
          primaryPhotoId: r.primaryPhotoId ?? photoId,
        };
      }),
    }));

    const room = updated.rooms.find((r) => r.id === roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.status(201).json(room);
  }
);

// Serve photo image
router.get('/:roomId/photos/:photoId/image', async (req: Request, res: Response) => {
  const { id: sessionId, roomId, photoId } = req.params;
  const session = await store.read(sessionId);
  const room = session?.rooms.find((r) => r.id === roomId);
  const photo = room?.photos.find((p) => p.id === photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const imgPath = path.join(DATA_DIR, 'sessions', sessionId, 'photos', roomId, photo.filename);
  res.sendFile(imgPath);
});

// 4.5 Delete photo
router.delete('/:roomId/photos/:photoId', async (req: Request, res: Response) => {
  const { id: sessionId, roomId, photoId } = req.params;
  const session = await store.read(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const room = session.rooms.find((r) => r.id === roomId);
  const photo = room?.photos.find((p) => p.id === photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const imgPath = path.join(DATA_DIR, 'sessions', sessionId, 'photos', roomId, photo.filename);
  try { await fs.unlink(imgPath); } catch {}

  await store.update(sessionId, (s) => ({
    ...s,
    rooms: s.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const photos = r.photos.filter((p) => p.id !== photoId);
      const primaryPhotoId =
        r.primaryPhotoId === photoId ? (photos[0]?.id ?? null) : r.primaryPhotoId;
      return { ...r, photos, primaryPhotoId };
    }),
  }));
  res.status(204).send();
});

// 4.6 Set primary photo
router.put('/:roomId/photos/:photoId/primary', async (req: Request, res: Response) => {
  const { id: sessionId, roomId, photoId } = req.params;
  const session = await store.read(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const updated = await store.update(sessionId, (s) => ({
    ...s,
    rooms: s.rooms.map((r) =>
      r.id === roomId ? { ...r, primaryPhotoId: photoId } : r
    ),
  }));

  const room = updated.rooms.find((r) => r.id === roomId);
  res.json(room);
});

export default router;
