import { Router } from 'express';
import { checkLibreOffice } from '../services/officeService';
import { checkGhostscript } from '../services/ghostscriptService';
import { checkQpdf } from '../services/qpdfService';

// Single endpoint the client polls on boot. Lets the UI know which heavy
// converters are actually available so backend-only tools can either light up
// or show their setup instructions instead of failing on submit.

const r = Router();

r.get('/capabilities', async (_req, res) => {
  const [libreoffice, ghostscript, qpdf] = await Promise.all([
    checkLibreOffice(),
    checkGhostscript(),
    checkQpdf(),
  ]);
  res.json({
    libreoffice,
    ghostscript,
    qpdf,
    // Reserved slots — populated in later phases.
    poppler: { available: false },
    tesseract: { available: false },
  });
});

export default r;
