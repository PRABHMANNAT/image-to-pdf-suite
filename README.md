# Ultra PDF Toolkit

A local-first PDF and image workspace built with React, Vite, TypeScript, Tailwind CSS, and an optional Node/Express backend. Most tools run entirely in the browser. Native backend engines can be installed for large files, Office conversion, stronger compression, OCR, encryption, repair, and archival conversion.

## Features

- Animated dashboard with category navigation, recent local files, and status-focused polish.
- Command palette and search. Press `Ctrl+K` or `/`, then type commands such as `merge`, `crop`, `compress`, `protect`, or `ocr`.
- Local recent files history stored in `localStorage` by file name, size, type, route, and tool.
- Batch processing queue that tracks running, successful, and failed jobs while you move around the app.
- Keyboard shortcuts:
  - `Ctrl+K`: open command palette
  - `/`: open command palette when not typing
  - `Ctrl+Enter`: run the current tool action when not typing
  - `Esc`: close overlays
- Empty states, loading skeletons, helpful tooltips, and an app-level error boundary.
- Responsive mobile drawer sidebar.
- Before/after preview for relevant PDF transformations, including compression and crop output.
- Output quality presets:
  - Maximum quality
  - Balanced
  - Small file
  - Custom
- Dark mode, settings, progress bars, result renaming, ZIP downloads, and local privacy by default.

## Browser-Only Features

These features work without the backend or native command-line tools, subject to browser memory limits:

- Image to PDF and JPG to PDF
- Crop Image
- Merge PDF
- Split PDF
- Remove Pages
- Extract Pages
- Organize PDF
- Scan to PDF
- HTML to PDF
- PDF to JPG/PNG/WEBP in browser mode
- PDF to PowerPoint
- PDF to Excel text/CSV/TSV extraction
- Rotate PDF
- Add Page Numbers
- Add Watermark
- Crop PDF
- Edit PDF overlays
- PDF Forms fill/flatten
- Sign PDF
- Redact PDF
- Compare PDF
- AI Summarizer local text extraction mode
- Translate PDF provider/local text flow
- Browser compression mode
- Browser fallback paths for several hybrid tools

## Backend-Required Features

These features require the Node/Express backend and, in many cases, native tools installed on the backend machine:

- Word to PDF, PowerPoint to PDF, Excel to PDF: LibreOffice
- PDF to Word and Office approximations: LibreOffice and/or backend extraction helpers
- PDF to PDF/A: Ghostscript
- Advanced Compress PDF: Ghostscript
- Protect PDF: qpdf
- Native Unlock PDF: qpdf
- Native Repair PDF: qpdf
- Native PDF to images: Poppler
- Backend OCR PDF: OCRmyPDF plus Tesseract, Ghostscript, qpdf, and Poppler
- Provider-backed AI summarization or translation if configured in the backend environment

The frontend checks backend capabilities and falls back to browser mode where the tool supports it.

## Setup

Requires Node.js 18 or newer. Node.js 20+ is recommended.

Install all JavaScript dependencies:

```bash
npm run install:all
```

Equivalent manual install:

```bash
npm install
npm --prefix server install
npm --prefix client install
```

Run the full development stack:

```bash
npm run dev
```

Default URLs:

- Client: http://localhost:5173
- Backend API: http://localhost:5174

Build everything:

```bash
npm run build
```

Run the compiled backend:

```bash
npm start
```

Serve `client/dist` with any static host for production frontend hosting.

## Backend Dependency Commands

Install Node backend dependencies:

```bash
npm --prefix server install
```

Install optional native engines on Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y libreoffice ghostscript qpdf poppler-utils ocrmypdf tesseract-ocr tesseract-ocr-eng
```

Install optional native engines on macOS:

```bash
brew install qpdf ghostscript poppler ocrmypdf tesseract
brew install --cask libreoffice
```

Install OCRmyPDF with Python when package-manager installation is not available:

```bash
python -m pip install ocrmypdf
```

Windows native engine setup is installer-based:

- LibreOffice: https://www.libreoffice.org/download/
- qpdf: https://github.com/qpdf/qpdf/releases
- Ghostscript: https://www.ghostscript.com/releases/gsdnld.html
- Poppler: install a Windows build and add its `bin` folder to `PATH`
- Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
- OCRmyPDF: install with Python after Ghostscript, qpdf, Poppler, and Tesseract are available

## Libraries

Frontend:

- React 18
- Vite
- TypeScript
- Tailwind CSS
- react-router-dom
- react-dropzone
- lucide-react
- pdf-lib
- pdfjs-dist
- html2canvas
- jszip
- file-saver
- react-easy-crop
- Konva and react-konva
- pptxgenjs
- tesseract.js

Backend:

- Node.js
- Express
- TypeScript
- multer
- cors
- pdf-lib
- sharp
- archiver
- tsx

Optional native engines:

- LibreOffice
- Ghostscript
- qpdf
- Poppler
- OCRmyPDF
- Tesseract

## Limitations

- Browser tools are limited by the user's device memory, CPU, canvas limits, and browser file handling.
- Some browser PDF operations rasterize output, which can remove selectable text.
- Browser compression is intentionally conservative compared with Ghostscript.
- Office conversion quality depends on LibreOffice compatibility with the source document.
- PDF to Office conversion is approximate and depends on source structure.
- Password removal is only for PDFs the user owns and can unlock.
- Recent files history stores metadata only, not file bytes.
- Batch queue history is session-scoped and not a background worker system.
- Large bundles are expected because PDF rendering, OCR, editing, and conversion libraries are included in the browser app.

## Future Roadmap

- Code-splitting by tool route to reduce initial bundle size.
- Persistent background job history for backend jobs.
- More visual before/after previews for watermark, redact, repair, and OCR.
- Backend upload-size and retention controls exposed in Settings.
- Drag-and-drop queue reordering for batch jobs.
- More advanced PDF text reconstruction for PDF to Word/PowerPoint/Excel.
- Optional cloud or LAN deployment templates.
- Automated end-to-end regression suite with sample PDFs and images.

## Verification

Current verified commands:

```bash
npm run build
```

The build compiles the server and client successfully. Vite may warn that the PDF/OCR/editor bundle is large; that is not a build failure.
