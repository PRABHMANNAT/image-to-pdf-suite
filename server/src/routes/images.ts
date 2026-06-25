import { Router } from 'express';
import { uploadImages } from '../services/fileService';
import * as ctrl from '../controllers/imageController';

const r = Router();

r.post('/metadata', uploadImages.array('files', 500), ctrl.metadata);
r.post('/to-pdf', uploadImages.array('files', 500), ctrl.toPdf);
r.post('/crop', uploadImages.single('file'), ctrl.crop);
r.post('/batch-crop', uploadImages.array('files', 500), ctrl.batchCrop);
r.post('/rotate', uploadImages.single('file'), ctrl.rotate);

export default r;
