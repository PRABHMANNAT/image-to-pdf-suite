import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { UPLOADS_DIR } from '../utils/paths';
import * as ctrl from '../controllers/officeController';

const OFFICE_EXT = new Set([
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  '.csv',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    // Sanitise the user-supplied name so we never write through "..", null
    // bytes, or shell-meaningful characters.
    const safe = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
    cb(null, `${id}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (OFFICE_EXT.has(ext)) cb(null, true);
    else cb(new Error('Unsupported office file: ' + ext));
  },
});

const r = Router();
r.post('/convert', upload.single('file'), ctrl.convert);

export default r;
