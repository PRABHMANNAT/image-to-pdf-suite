import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { savePdfLib } from './pdfUtils';

export type TextExportFormat = 'txt' | 'docx' | 'pdf';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function textToTxt(text: string): Blob {
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

export async function textToDocx(title: string, text: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  const paragraphs = [title, '', ...text.split(/\r?\n/)]
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join('');

  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars) {
        if (line) out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function textToPdf(title: string, text: string): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  const lineHeight = 15;
  const maxLines = Math.floor((pageSize[1] - margin * 2 - 28) / lineHeight);
  const lines = wrapText(text, 88);
  let cursor = 0;

  while (cursor < lines.length || cursor === 0) {
    const page = pdf.addPage(pageSize);
    const { height } = page.getSize();
    let y = height - margin;
    page.drawText(title, { x: margin, y, size: 15, font: bold, color: rgb(0.06, 0.09, 0.16) });
    y -= 28;

    for (let i = 0; i < maxLines && cursor < lines.length; i++, cursor++) {
      page.drawText(lines[cursor], {
        x: margin,
        y,
        size: 10.5,
        font,
        color: rgb(0.09, 0.13, 0.22),
      });
      y -= lineHeight;
    }

    if (!lines.length) break;
  }

  return savePdfLib(pdf);
}

export async function exportText(title: string, text: string, format: TextExportFormat): Promise<Blob> {
  if (format === 'docx') return textToDocx(title, text);
  if (format === 'pdf') return textToPdf(title, text);
  return textToTxt(text);
}
