import { Router } from 'express';
import { cleanupAll } from '../services/cleanupService';

const r = Router();

r.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
r.delete('/temp/cleanup', (_req, res) => {
  cleanupAll();
  res.json({ ok: true });
});

export default r;
