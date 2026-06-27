import { Router } from 'express';
import * as ctrl from '../controllers/intelligenceController';

const r = Router();

r.get('/status', ctrl.status);
r.post('/generate', ctrl.generate);

export default r;
