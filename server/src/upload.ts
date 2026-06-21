import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function mimeFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(new Error('Unsupported file type. Accepted: JPEG, PNG, WebP, PDF'), {
        status: 422,
      })
    );
  }
}

export const floorPlanUpload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const sessionId = req.params.id;
      const dir = path.join(DATA_DIR, 'sessions', sessionId, 'floor-plan');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `floor-plan${ext}`);
    },
  }),
  fileFilter: mimeFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

export const photoUpload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const { id: sessionId, roomId } = req.params;
      const dir = path.join(DATA_DIR, 'sessions', sessionId, 'photos', roomId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${Date.now()}${ext}`);
    },
  }),
  fileFilter: mimeFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});
