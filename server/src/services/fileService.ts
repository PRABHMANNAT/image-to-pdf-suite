import multer from 'multer';
import { UPLOADS_DIR } from '../utils/paths';
import path from 'path';
import crypto from 'crypto';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${id}-${path.basename(file.originalname).replace(/[^\w.\-]/g, '_')}`);
  },
});

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif']);
const PDF_EXT = new Set(['.pdf']);

export const uploadImages = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 500 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXT.has(ext)) cb(null, true);
    else cb(new Error('Unsupported image type: ' + ext));
  },
});

export const uploadPdfs = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 100 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (PDF_EXT.has(ext)) cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
});

export const uploadAny = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 500 },
});
