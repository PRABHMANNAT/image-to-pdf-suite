import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { UPLOADS_DIR } from '../utils/paths';
import * as ctrl from '../controllers/pdfConvertController';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const safe = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
    cb(null, `${id}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed for /pdf/convert'));
  },
});

const r = Router();

// POST /api/pdf/convert/:target — target is docx | pptx | xlsx | pdfa | …
r.post('/convert/:target', upload.single('file'), ctrl.convert);

export default r;
