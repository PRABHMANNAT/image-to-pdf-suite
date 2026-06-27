# Ultra PDF Image Toolkit

A **local-first** file utility web app for working with images and PDFs. Convert any number of images to a high-resolution PDF, crop and rotate images, merge/split/edit PDFs - all processed entirely on your own machine.

> Files never leave your computer. Nothing is uploaded to any cloud service.

## Features

- **Image to PDF**
  - Upload many images at once (200+ supported)
  - JPG, JPEG, PNG, WEBP, TIFF, BMP, GIF
  - Drag-and-drop reorder, A-Z / Z-A sort, remove individual files
  - Page layouts: same size as image, A4 / Letter portrait & landscape, custom mm
  - Image fit: Fit / Fill (crop) / Stretch / Original
  - Configurable margin and background color
  - **Maximum Quality Mode** (default): no downscaling, EXIF auto-rotation, JPEG quality 100, lossless PNG
- **Crop Image**
  - Single image crop or batch crop with same region
  - Aspect ratios: Free, 1:1, 4:5, 9:16, 16:9, A4, Passport
  - Export PNG / JPEG / WEBP at quality 100
- **PDF Merge** - combine multiple PDFs into one, preserve original quality, no rasterization
- **PDF Split**
  - Split every page into separate PDFs (downloaded as ZIP)
  - Extract page range (e.g. `1-5`, `1,3,7`, `2-4,8,10-12`)
  - Split into chunks of N pages
- **PDF Page Editor** - extract, remove, reorder, or rotate pages
- **Local privacy** - uploads land in a temporary folder, auto-cleaned after 1 hour or via Settings → Clear temp files
- **Dark mode**, toast notifications, progress bars, friendly error messages

## Tech stack

- Frontend: React + Vite + TypeScript + Tailwind CSS + react-dropzone + lucide-react
- Backend: Node.js + Express + TypeScript
- Image processing: sharp
- PDF processing: pdf-lib
- Uploads: multer (disk storage in `server/uploads`)
- ZIP bundling: archiver

## Folder structure

```
ultra-pdf-image-toolkit/
├─ client/                React + Vite app
│  └─ src/
│     ├─ components/      FileDropzone, FileList, ProgressBar, Sidebar, ToolLayout
│     ├─ pages/           ImageToPdf, CropImage, MergePdf, SplitPdf, PdfPageEditor, Settings
│     ├─ hooks/           useToast
│     ├─ utils/           api helpers
│     ├─ types/
│     ├─ App.tsx
│     └─ main.tsx
├─ server/                Express API
│  └─ src/
│     ├─ routes/          images.ts, pdf.ts, utility.ts
│     ├─ controllers/     imageController.ts, pdfController.ts
│     ├─ services/        imageService.ts, pdfService.ts, fileService.ts, cleanupService.ts
│     ├─ utils/           paths.ts, pageRange.ts
│     ├─ app.ts
│     └─ server.ts
├─ shared/types/          shared TypeScript types
├─ package.json           root - runs client+server with concurrently
└─ README.md
```

Temporary working dirs (auto-created, gitignored):
- `server/uploads/` - incoming uploads
- `server/outputs/` - generated PDFs/ZIPs
- `server/temp/`

## Install

Requires **Node.js 18+** (Node 20 recommended).

```bash
# from project root
npm install
npm --prefix server install
npm --prefix client install
```

Or all at once:

```bash
npm run install:all
```

> sharp installs prebuilt binaries for your platform. On some Linux distros you may need `apt-get install -y libvips`.

## Optional native backend engines

The app works without paid services. Browser mode remains available where practical, but large or advanced jobs can use native tools installed on the machine running the backend. There are no usage limits beyond your device/server CPU, memory, disk, and the upload limits configured in the app.

Install any engines you want to enable:

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y libreoffice ghostscript qpdf poppler-utils ocrmypdf tesseract-ocr tesseract-ocr-eng

# macOS
brew install qpdf ghostscript poppler ocrmypdf tesseract
brew install --cask libreoffice

# Windows
# LibreOffice: https://www.libreoffice.org/download/
# qpdf:        https://github.com/qpdf/qpdf/releases
# Ghostscript: https://www.ghostscript.com/releases/gsdnld.html
# Poppler:     install a Poppler build and add its bin folder to PATH
# Tesseract:   https://github.com/UB-Mannheim/tesseract/wiki
# OCRmyPDF:    install via Python after Ghostscript, qpdf, Poppler, and Tesseract are available:
python -m pip install ocrmypdf
```

Native engine coverage:

| Engine | Enables |
| ------ | ------- |
| LibreOffice headless | Word/PowerPoint/Excel to PDF; PDF to DOCX/PPTX/XLSX approximations |
| qpdf | Protect PDF, Unlock PDF, native Repair PDF |
| Ghostscript | Advanced Compress PDF, PDF/A conversion |
| Poppler | Native PDF to images, native text extraction |
| OCRmyPDF/Tesseract | High-quality searchable OCR PDFs |

The frontend checks `/api/capabilities` at startup. If a native engine is missing, the related page shows browser-only mode or setup instructions instead of failing silently.

Backend processing uses secure disk uploads:

- file types are validated by route before processing
- filenames are sanitized before writing to disk
- uploads land in `server/uploads/`
- native tools run in per-job directories under `server/temp/`
- outputs stream back as downloads
- upload/temp files are deleted after the response and old files are swept automatically
- long-running native jobs expose status through `/api/backend/jobs/:id`

## Run (development)

```bash
npm run dev
```

This starts the API on **http://localhost:5174** and the client on **http://localhost:5173** (with `/api` proxied to the server).

Open <http://localhost:5173>.

## Build & run (production)

```bash
npm run build
npm start          # runs the compiled server on PORT (default 5174)
# serve client/dist with any static server (e.g. `npx serve client/dist`)
```

## How to use

### Image to PDF
1. Click **Image to PDF** in the sidebar.
2. Drop images (or click the dropzone). Add as many as you like.
3. Drag-and-arrow buttons to reorder. Sort A-Z / Z-A if desired.
4. Pick a page layout. For maximum quality leave it on **Same size as image**.
5. Choose fit mode, margin, background, and JPEG quality.
6. Click **Create PDF**. The result downloads to your machine.

### Crop image
1. Open **Crop Image**, drop one or many images.
2. Pick an aspect ratio (Free for unconstrained).
3. Adjust the `left/top/width/height` numeric inputs (in image pixels).
4. Choose PNG / JPEG / WEBP and quality.
5. Click **Download cropped** (single) or **Batch crop N** (multiple → ZIP).

### Merge PDFs
1. **Merge PDF**, drop 2+ PDFs.
2. Reorder with the ↑ / ↓ buttons.
3. **Merge & download** writes a single combined PDF.

### Split PDF
1. **Split PDF**, drop one PDF.
2. Choose **Split every page**, **Extract range**, or **Chunks of N pages**.
3. Click **Split**. Multi-file outputs come back as a ZIP.

### PDF page editor
1. **PDF Page Editor**, drop a PDF.
2. Pick an operation (Extract / Remove / Reorder / Rotate).
3. Enter a page range like `1-3,5,8-10`, or a 1-based reorder list like `3,1,2`.
4. **Apply & download**.

## API reference

All endpoints accept `multipart/form-data` and return either the resulting file as an attachment or JSON.

| Method | Path                       | Notes |
| ------ | -------------------------- | ----- |
| POST   | `/api/images/metadata`     | array `files` → JSON metadata for each |
| POST   | `/api/images/to-pdf`       | array `files` + options → PDF |
| POST   | `/api/images/crop`         | single `file` + region → cropped image |
| POST   | `/api/images/batch-crop`   | array `files` + region → ZIP |
| POST   | `/api/images/rotate`       | single `file` + angle/flip → PNG |
| POST   | `/api/pdf/metadata`        | array `files` → JSON |
| POST   | `/api/pdf/merge`           | array `files` → merged PDF |
| POST   | `/api/pdf/split`           | single `file` + `kind` → PDF or ZIP |
| POST   | `/api/pdf/extract`         | single `file` + `range` → PDF |
| POST   | `/api/pdf/remove-pages`    | single `file` + `range` → PDF |
| POST   | `/api/pdf/reorder`         | single `file` + `order` → PDF |
| POST   | `/api/pdf/rotate-pages`    | single `file` + optional `range` + `angle` → PDF |
| POST   | `/api/backend/pdf/compress` | single PDF + `preset` (`screen`, `ebook`, `printer`, `prepress`) → PDF |
| POST   | `/api/backend/pdf/repair` | single PDF → repaired PDF via qpdf |
| POST   | `/api/backend/pdf/to-images` | single PDF + `format`, `dpi`, optional `firstPage`/`lastPage` → ZIP |
| POST   | `/api/backend/pdf/extract-text` | single PDF + optional `layout` → TXT |
| POST   | `/api/backend/pdf/ocr` | single PDF + `language` → searchable PDF via OCRmyPDF |
| GET    | `/api/backend/jobs/:id` | JSON status for a backend job |
| GET    | `/api/backend/capabilities` | force-refresh native engine capabilities |
| GET    | `/api/health`              | health check |
| DELETE | `/api/temp/cleanup`        | wipe temp/upload/output dirs |

### Page range syntax

- `1-5` → pages 1 through 5
- `1,3,7` → pages 1, 3, and 7
- `2-4,8,10-12` → mixed
- 1-based, validated, out-of-range entries are clamped/ignored.

## Privacy

All processing happens on your local machine. There are no third-party calls. Uploads are stored under `server/uploads/`, results under `server/outputs/`, and both directories are wiped one hour after the file's last modification time (see `server/src/services/cleanupService.ts`). You can also wipe them manually from **Settings → Clear temp files**.

## Limits

- Per image upload: 200 MB
- Per PDF upload: 500 MB
- Files per request: 500 for images, 100 for PDFs
- These are configurable in `server/src/services/fileService.ts`.

## Troubleshooting

- **`sharp` install fails** - install build tools or libvips, or use Node 20.
- **CORS / connection refused** - make sure both `client` and `server` are running (use `npm run dev`).
- **Large PDFs** - using `Same size as image` with hundreds of high-res photos can produce very large PDFs. Switch to A4 + Fit to reduce size.
- **WEBP / TIFF output looks different** - the toolkit transcodes to PNG (if alpha) or high-quality JPEG before embedding into the PDF.

## Future improvements

- Client-side previews of generated PDF
- True visual crop rectangle drag handles
- OCR / searchable PDF
- Compression presets
- Drag-to-reorder using HTML5 DnD
- Cancel-in-flight via `AbortController`

## License

MIT
