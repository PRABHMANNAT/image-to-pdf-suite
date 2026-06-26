import { Router } from 'express';
import { checkLibreOffice } from '../services/officeService';

// Single endpoint the client polls on boot. Lets the UI know which heavy
// converters are actually available so backend-only tools can either light up
// or show their setup instructions instead of failing on submit.

const r = Router();

r.get('/capabilities', async (_req, res) => {
  const libreoffice = await checkLibreOffice();
  res.json({
    libreoffice,
    // The slots below are reserved for upcoming phases. The client treats
    // missing keys as "unknown / not detected" so adding them later is
    // backwards-compatible.
    ghostscript: { available: false },
    qpdf: { available: false },
    poppler: { available: false },
    tesseract: { available: false },
  });
});

export default r;
