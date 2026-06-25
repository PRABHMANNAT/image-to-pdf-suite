import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { PDFDocument, degrees } from 'pdf-lib';
import { OUTPUTS_DIR } from '../utils/paths';

export async function pdfMetadata(filePath: string, originalname: string) {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return {
    name: originalname,
    size: bytes.length,
    pageCount: doc.getPageCount(),
  };
}

export async function mergePdfs(files: string[]): Promise<string> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const bytes = await out.save({ useObjectStreams: true });
  const file = path.join(OUTPUTS_DIR, `merged-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

// Build a new PDF containing only the given zero-based page indices in order.
export async function extractPages(filePath: string, pages: number[]): Promise<string> {
  const src = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const valid = pages.filter((p) => p >= 0 && p < src.getPageCount());
  const copied = await out.copyPages(src, valid);
  copied.forEach((p) => out.addPage(p));
  const bytes = await out.save({ useObjectStreams: true });
  const file = path.join(OUTPUTS_DIR, `extract-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

export async function removePages(filePath: string, pagesToRemove: number[]): Promise<string> {
  const src = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
  const remove = new Set(pagesToRemove);
  const keep = src.getPageIndices().filter((i) => !remove.has(i));
  return extractPages(filePath, keep);
}

export async function reorderPages(filePath: string, order: number[]): Promise<string> {
  return extractPages(filePath, order);
}

export async function rotatePages(filePath: string, pages: number[], angle: number): Promise<string> {
  const src = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
  const set = new Set(pages);
  src.getPages().forEach((p, i) => {
    if (set.has(i)) {
      const current = p.getRotation().angle;
      p.setRotation(degrees((current + angle) % 360));
    }
  });
  const bytes = await src.save({ useObjectStreams: true });
  const file = path.join(OUTPUTS_DIR, `rotated-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

export type SplitMode =
  | { kind: 'each' }
  | { kind: 'range'; pages: number[] }
  | { kind: 'chunks'; size: number };

// Always returns an array of result PDF file paths.
export async function splitPdf(filePath: string, mode: SplitMode): Promise<string[]> {
  const src = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
  const total = src.getPageCount();
  const out: string[] = [];
  const id = crypto.randomBytes(6).toString('hex');

  if (mode.kind === 'each') {
    for (let i = 0; i < total; i++) {
      const doc = await PDFDocument.create();
      const [p] = await doc.copyPages(src, [i]);
      doc.addPage(p);
      const file = path.join(OUTPUTS_DIR, `split-${id}-p${i + 1}.pdf`);
      fs.writeFileSync(file, await doc.save({ useObjectStreams: true }));
      out.push(file);
    }
  } else if (mode.kind === 'range') {
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, mode.pages.filter((p) => p >= 0 && p < total));
    copied.forEach((p) => doc.addPage(p));
    const file = path.join(OUTPUTS_DIR, `split-${id}-range.pdf`);
    fs.writeFileSync(file, await doc.save({ useObjectStreams: true }));
    out.push(file);
  } else if (mode.kind === 'chunks') {
    const size = Math.max(1, mode.size);
    let chunkIdx = 1;
    for (let i = 0; i < total; i += size) {
      const indices: number[] = [];
      for (let j = i; j < Math.min(i + size, total); j++) indices.push(j);
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, indices);
      copied.forEach((p) => doc.addPage(p));
      const file = path.join(OUTPUTS_DIR, `split-${id}-chunk${chunkIdx}.pdf`);
      fs.writeFileSync(file, await doc.save({ useObjectStreams: true }));
      out.push(file);
      chunkIdx++;
    }
  }
  return out;
}

export async function zipFiles(files: string[]): Promise<string> {
  const zipPath = path.join(OUTPUTS_DIR, `bundle-${crypto.randomBytes(6).toString('hex')}.zip`);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    for (const f of files) archive.file(f, { name: path.basename(f) });
    archive.finalize();
  });
  return zipPath;
}
