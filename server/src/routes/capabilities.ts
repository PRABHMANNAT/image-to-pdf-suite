import { Router } from 'express';
import { checkLibreOffice } from '../services/officeService';
import { checkGhostscript } from '../services/ghostscriptService';
import { checkQpdf } from '../services/qpdfService';
import { checkPoppler } from '../services/popplerService';
import { checkOcrBackend } from '../services/ocrBackendService';

// Single endpoint the client polls on boot. Lets the UI know which heavy
// converters are actually available so backend-only tools can either light up
// or show setup instructions instead of failing on submit.

const r = Router();

r.get('/capabilities', async (_req, res) => {
  const [libreoffice, ghostscript, qpdf, poppler, ocr] = await Promise.all([
    checkLibreOffice(),
    checkGhostscript(),
    checkQpdf(),
    checkPoppler(),
    checkOcrBackend(),
  ]);
  res.json({
    libreoffice,
    ghostscript,
    qpdf,
    poppler,
    tesseract: ocr.tesseract || { available: false },
    ocr,
  });
});

export default r;
