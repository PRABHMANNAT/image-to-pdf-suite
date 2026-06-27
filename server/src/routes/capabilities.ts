import { Router } from 'express';
import { checkLibreOffice } from '../services/officeService';
import { checkGhostscript } from '../services/ghostscriptService';

// Single endpoint the client polls on boot. Lets the UI know which heavy
// converters are actually available so backend-only tools can either light up
// or show their setup instructions instead of failing on submit.

const r = Router();

r.get('/capabilities', async (_req, res) => {
  const [libreoffice, ghostscript] = await Promise.all([
    checkLibreOffice(),
    checkGhostscript(),
  ]);
  res.json({
    libreoffice,
    ghostscript,
    // Reserved slots — populated in later phases.
    qpdf: { available: false },
    poppler: { available: false },
    tesseract: { available: false },
  });
});

export default r;
