import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../SessionStore.js';
import { Session } from '../types.js';

const router = Router();

router.post('/', async (_req: Request, res: Response) => {
  const id = uuidv4();
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    floorPlan: null,
    rooms: [],
    jobs: [],
  };
  await store.write(id, session);
  res.status(201).json({ sessionId: id });
});

router.get('/:id', async (req: Request, res: Response) => {
  const session = await store.read(req.params.id as string);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

export default router;
