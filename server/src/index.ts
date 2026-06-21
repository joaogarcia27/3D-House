import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initQueue } from './queue.js';
import sessionsRouter from './routes/sessions.js';
import floorPlanRouter from './routes/floorPlan.js';
import roomsRouter from './routes/rooms.js';
import generationRouter from './routes/generation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the project root (two levels up from server/src/)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions/:id/floor-plan', floorPlanRouter);
app.use('/api/sessions/:id/rooms', roomsRouter);
app.use('/api/sessions/:id/generate', generationRouter);
app.use('/api/sessions/:id', generationRouter); // for /jobs and /events and /assets

// Serve static data assets
app.use('/data', express.static(DATA_DIR));

initQueue().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Generation mode: ${process.env.GENERATION_MODE ?? 'real (requires Redis)'}`);
  });
});

export default app;
