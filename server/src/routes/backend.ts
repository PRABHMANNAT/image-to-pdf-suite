import { Router } from 'express';
import { uploadPdfs } from '../services/fileService';
import * as ctrl from '../controllers/backendController';

const r = Router();

r.get('/capabilities', ctrl.capabilities);
r.get('/jobs', ctrl.jobs);
r.get('/jobs/:id', ctrl.jobStatus);

r.post('/pdf/compress', uploadPdfs.single('file'), ctrl.compress);
r.post('/pdf/repair', uploadPdfs.single('file'), ctrl.repair);
r.post('/pdf/to-images', uploadPdfs.single('file'), ctrl.toImages);
r.post('/pdf/extract-text', uploadPdfs.single('file'), ctrl.extractText);
r.post('/pdf/ocr', uploadPdfs.single('file'), ctrl.ocr);

export default r;
