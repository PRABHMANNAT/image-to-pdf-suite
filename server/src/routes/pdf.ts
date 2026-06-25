import { Router } from 'express';
import { uploadPdfs } from '../services/fileService';
import * as ctrl from '../controllers/pdfController';

const r = Router();

r.post('/metadata', uploadPdfs.array('files', 100), ctrl.metadata);
r.post('/merge', uploadPdfs.array('files', 100), ctrl.merge);
r.post('/split', uploadPdfs.single('file'), ctrl.split);
r.post('/extract', uploadPdfs.single('file'), ctrl.extract);
r.post('/remove-pages', uploadPdfs.single('file'), ctrl.removePagesCtrl);
r.post('/reorder', uploadPdfs.single('file'), ctrl.reorder);
r.post('/rotate-pages', uploadPdfs.single('file'), ctrl.rotateCtrl);

export default r;
