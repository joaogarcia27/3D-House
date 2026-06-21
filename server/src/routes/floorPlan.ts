import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { floorPlanUpload } from '../upload.js';
import { store } from '../SessionStore.js';
import { FloorPlanParserService } from '../FloorPlanParserService.js';

const router = Router({ mergeParams: true });
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');

router.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    floorPlanUpload.single('file')(req, res, (err) => {
      if (err) {
        const status = (err as { status?: number }).status ?? 500;
        return res.status(status).json({ error: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const session = await store.read(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const relUrl = `/api/sessions/${sessionId}/floor-plan/image`;
    await store.update(sessionId, (s) => ({
      ...s,
      floorPlan: {
        imageFilename: file.filename,
        imageUrl: relUrl,
        parseStatus: 'processing',
        reviewRequired: false,
        dimensionsEstimated: false,
      },
    }));

    console.log(`[FloorPlan] upload received — session=${sessionId} file=${file.filename} size=${(file.size / 1024).toFixed(1)}KB`);
    res.json({ status: 'processing' });

    // Parse async after responding
    (async () => {
      try {
        console.log(`[FloorPlan] starting async parse for session=${sessionId}`);
        const result = await new FloorPlanParserService().parse(file.path);
        console.log(`[FloorPlan] parse complete — session=${sessionId} rooms=${result.rooms.length}`);
        await store.update(sessionId, (s) => ({
          ...s,
          floorPlan: {
            ...(s.floorPlan!),
            parseStatus: 'done',
            reviewRequired: result.reviewRequired,
            dimensionsEstimated: result.dimensionsEstimated,
          },
          rooms: result.rooms,
        }));
      } catch (err) {
        console.error(`[FloorPlan] parse failed — session=${sessionId}:`, err);
        await store.update(sessionId, (s) => ({
          ...s,
          floorPlan: {
            ...(s.floorPlan!),
            parseStatus: 'parse_failed',
            error: (err as Error).message,
          },
        }));
      }
    })();
  }
);

router.get('/image', async (req: Request, res: Response) => {
  const session = await store.read(req.params.id);
  if (!session?.floorPlan) return res.status(404).json({ error: 'No floor plan' });
  const imgPath = path.join(
    DATA_DIR,
    'sessions',
    req.params.id,
    'floor-plan',
    session.floorPlan.imageFilename
  );
  res.sendFile(imgPath);
});

export default router;
