import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import imagesRouter from './routes/images';
import pdfRouter from './routes/pdf';
import pdfConvertRouter from './routes/pdfConvert';
import securityRouter from './routes/security';
import utilityRouter from './routes/utility';
import officeRouter from './routes/office';
import capabilitiesRouter from './routes/capabilities';
import intelligenceRouter from './routes/intelligence';
import backendRouter from './routes/backend';
import { ensureDirs } from './utils/paths';
import { startCleanupTimer } from './services/cleanupService';
import { loadEnvFiles } from './utils/env';

export function createApp() {
  loadEnvFiles();
  ensureDirs();
  startCleanupTimer();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/images', imagesRouter);
  app.use('/api/pdf', pdfRouter);
  app.use('/api/pdf', pdfConvertRouter);
  app.use('/api/pdf', securityRouter);
  app.use('/api/office', officeRouter);
  app.use('/api/intelligence', intelligenceRouter);
  app.use('/api/backend', backendRouter);
  app.use('/api', capabilitiesRouter);
  app.use('/api', utilityRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[error]', err);
    if (res.headersSent) return;
    res.status(400).json({ error: err.message || 'Internal error' });
  };
  app.use(errorHandler);

  return app;
}
