import {
  LayoutDashboard,
  Image as ImageIcon,
  Crop,
  FilePlus,
  Scissors,
  FileMinus,
  FileOutput,
  ListOrdered,
  ScanLine,
  Minimize2,
  Wrench,
  ScanText,
  FileImage,
  FileType,
  Presentation,
  Sheet,
  Globe,
  FileCode2,
  FileType2,
  RotateCw,
  Hash,
  Droplet,
  Crop as CropIcon,
  Pencil,
  FormInput,
  LockOpen,
  Lock,
  PenLine,
  EyeOff,
  GitCompareArrows,
  Sparkles,
  Languages,
  Settings as SettingsIcon,
  Files,
  Shield,
  Brain,
  FileEdit,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

export type Runtime = 'browser' | 'backend' | 'hybrid';
export type Status = 'ready' | 'coming-soon' | 'beta';

export type CategoryId =
  | 'dashboard'
  | 'image'
  | 'organize'
  | 'optimize'
  | 'convert-to'
  | 'convert-from'
  | 'edit'
  | 'security'
  | 'intelligence'
  | 'settings';

export interface Category {
  id: CategoryId;
  name: string;
  icon: LucideIcon;
  description?: string;
  hue: string; // tailwind color stem, drives accent glow
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  route: string;
  category: CategoryId;
  icon: LucideIcon;
  runtime: Runtime;
  status: Status;
}

export const CATEGORIES: Category[] = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, hue: 'sky' },
  { id: 'image', name: 'Image Tools', icon: ImageIcon, hue: 'fuchsia', description: 'Convert and crop images.' },
  { id: 'organize', name: 'Organize PDF', icon: Files, hue: 'blue', description: 'Combine, split, and rearrange pages.' },
  { id: 'optimize', name: 'Optimize PDF', icon: Wand2, hue: 'emerald', description: 'Compress, repair, and OCR your PDFs.' },
  { id: 'convert-to', name: 'Convert to PDF', icon: FileOutput, hue: 'amber', description: 'Turn anything into PDF.' },
  { id: 'convert-from', name: 'Convert from PDF', icon: FileImage, hue: 'rose', description: 'Export PDFs to other formats.' },
  { id: 'edit', name: 'Edit PDF', icon: FileEdit, hue: 'violet', description: 'Annotate and modify pages.' },
  { id: 'security', name: 'PDF Security', icon: Shield, hue: 'indigo', description: 'Protect, sign, and compare.' },
  { id: 'intelligence', name: 'PDF Intelligence', icon: Brain, hue: 'cyan', description: 'AI-assisted PDF tasks.' },
  { id: 'settings', name: 'Settings', icon: SettingsIcon, hue: 'slate' },
];

export const TOOLS: Tool[] = [
  // Image Tools
  { id: 'image-to-pdf', name: 'Image to PDF', description: 'Convert any number of images into a single high-resolution PDF.', route: '/tools/image-to-pdf', category: 'image', icon: ImageIcon, runtime: 'hybrid', status: 'ready' },
  { id: 'crop-image', name: 'Crop Image', description: 'Crop one or many images with visual handles and aspect presets.', route: '/tools/crop-image', category: 'image', icon: Crop, runtime: 'hybrid', status: 'ready' },

  // Organize PDF
  { id: 'merge-pdf', name: 'Merge PDF', description: 'Combine multiple PDFs into one. Original quality preserved.', route: '/tools/merge-pdf', category: 'organize', icon: FilePlus, runtime: 'browser', status: 'ready' },
  { id: 'split-pdf', name: 'Split PDF', description: 'Split each page, a range, or fixed chunks.', route: '/tools/split-pdf', category: 'organize', icon: Scissors, runtime: 'browser', status: 'ready' },
  { id: 'remove-pages', name: 'Remove Pages', description: 'Delete one or more pages from a PDF.', route: '/tools/remove-pages', category: 'organize', icon: FileMinus, runtime: 'browser', status: 'ready' },
  { id: 'extract-pages', name: 'Extract Pages', description: 'Pull selected pages into a new PDF.', route: '/tools/extract-pages', category: 'organize', icon: FileOutput, runtime: 'browser', status: 'ready' },
  { id: 'organize-pdf', name: 'Organize PDF', description: 'Reorder, rotate and delete pages visually.', route: '/tools/organize-pdf', category: 'organize', icon: ListOrdered, runtime: 'browser', status: 'ready' },
  { id: 'scan-to-pdf', name: 'Scan to PDF', description: 'Clean up phone-scanned pages and export a tidy PDF.', route: '/tools/scan-to-pdf', category: 'organize', icon: ScanLine, runtime: 'browser', status: 'beta' },

  // Optimize PDF
  { id: 'compress-pdf', name: 'Compress PDF', description: 'Reduce PDF size with quality controls.', route: '/tools/compress-pdf', category: 'optimize', icon: Minimize2, runtime: 'hybrid', status: 'ready' },
  { id: 'repair-pdf', name: 'Repair PDF', description: 'Recover and rebuild a damaged PDF.', route: '/tools/repair-pdf', category: 'optimize', icon: Wrench, runtime: 'hybrid', status: 'beta' },
  { id: 'ocr-pdf', name: 'OCR PDF', description: 'Make scanned PDFs searchable with on-device OCR.', route: '/tools/ocr-pdf', category: 'optimize', icon: ScanText, runtime: 'hybrid', status: 'beta' },

  // Convert to PDF
  { id: 'jpg-to-pdf', name: 'JPG to PDF', description: 'Combine JPG images (and PNG/WEBP) into a single PDF — same engine as Image to PDF.', route: '/tools/jpg-to-pdf', category: 'convert-to', icon: FileImage, runtime: 'browser', status: 'ready' },
  { id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert .docx documents into PDF via LibreOffice headless.', route: '/tools/word-to-pdf', category: 'convert-to', icon: FileType, runtime: 'backend', status: 'beta' },
  { id: 'ppt-to-pdf', name: 'PowerPoint to PDF', description: 'Convert .pptx decks into PDF via LibreOffice headless.', route: '/tools/ppt-to-pdf', category: 'convert-to', icon: Presentation, runtime: 'backend', status: 'beta' },
  { id: 'excel-to-pdf', name: 'Excel to PDF', description: 'Convert .xlsx workbooks into PDF via LibreOffice headless.', route: '/tools/excel-to-pdf', category: 'convert-to', icon: Sheet, runtime: 'backend', status: 'beta' },
  { id: 'html-to-pdf', name: 'HTML to PDF', description: 'Paste or upload HTML and render it to PDF locally.', route: '/tools/html-to-pdf', category: 'convert-to', icon: Globe, runtime: 'browser', status: 'beta' },

  // Convert from PDF
  { id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Render each PDF page to a high-quality JPG / PNG / WEBP image.', route: '/tools/pdf-to-jpg', category: 'convert-from', icon: FileImage, runtime: 'browser', status: 'ready' },
  { id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDFs to .docx via LibreOffice, or extract plain text in-browser.', route: '/tools/pdf-to-word', category: 'convert-from', icon: FileType, runtime: 'hybrid', status: 'beta' },
  { id: 'pdf-to-ppt', name: 'PDF to PowerPoint', description: 'Build a .pptx where each PDF page becomes one slide image.', route: '/tools/pdf-to-ppt', category: 'convert-from', icon: Presentation, runtime: 'browser', status: 'beta' },
  { id: 'pdf-to-excel', name: 'PDF to Excel', description: 'Heuristic table extraction → CSV / TSV / plain text in the browser.', route: '/tools/pdf-to-excel', category: 'convert-from', icon: Sheet, runtime: 'browser', status: 'beta' },
  { id: 'pdf-to-pdfa', name: 'PDF to PDF/A', description: 'Convert to archival PDF/A-1b/2b/3b via Ghostscript on the backend.', route: '/tools/pdf-to-pdfa', category: 'convert-from', icon: FileType2, runtime: 'backend', status: 'beta' },

  // Edit PDF
  { id: 'rotate-pdf', name: 'Rotate PDF', description: 'Rotate one, several, or all pages.', route: '/tools/rotate-pdf', category: 'edit', icon: RotateCw, runtime: 'browser', status: 'ready' },
  { id: 'page-numbers', name: 'Add Page Numbers', description: 'Stamp page numbers with custom position, font, color, prefix and range.', route: '/tools/page-numbers', category: 'edit', icon: Hash, runtime: 'browser', status: 'beta' },
  { id: 'watermark', name: 'Add Watermark', description: 'Stamp a text or image watermark with opacity, rotation, anchor and tile patterns.', route: '/tools/watermark', category: 'edit', icon: Droplet, runtime: 'browser', status: 'beta' },
  { id: 'crop-pdf', name: 'Crop PDF', description: 'Drag a crop rectangle on a real page preview and apply to all/selected/range.', route: '/tools/crop-pdf', category: 'edit', icon: CropIcon, runtime: 'browser', status: 'beta' },
  { id: 'edit-pdf', name: 'Edit PDF', description: 'Add text, shapes and images to a PDF.', route: '/tools/edit-pdf', category: 'edit', icon: Pencil, runtime: 'browser', status: 'coming-soon' },
  { id: 'pdf-forms', name: 'PDF Forms', description: 'Fill out and flatten PDF forms.', route: '/tools/pdf-forms', category: 'edit', icon: FormInput, runtime: 'browser', status: 'coming-soon' },

  // PDF Security
  { id: 'unlock-pdf', name: 'Unlock PDF', description: 'Remove the password from a PDF you own.', route: '/tools/unlock-pdf', category: 'security', icon: LockOpen, runtime: 'hybrid', status: 'coming-soon' },
  { id: 'protect-pdf', name: 'Protect PDF', description: 'Encrypt a PDF with a password.', route: '/tools/protect-pdf', category: 'security', icon: Lock, runtime: 'browser', status: 'coming-soon' },
  { id: 'sign-pdf', name: 'Sign PDF', description: 'Place a typed, drawn or image signature.', route: '/tools/sign-pdf', category: 'security', icon: PenLine, runtime: 'browser', status: 'coming-soon' },
  { id: 'redact-pdf', name: 'Redact PDF', description: 'Permanently black-out sensitive areas.', route: '/tools/redact-pdf', category: 'security', icon: EyeOff, runtime: 'browser', status: 'coming-soon' },
  { id: 'compare-pdf', name: 'Compare PDF', description: 'Diff two PDFs side-by-side.', route: '/tools/compare-pdf', category: 'security', icon: GitCompareArrows, runtime: 'browser', status: 'coming-soon' },

  // PDF Intelligence
  { id: 'ai-summarize', name: 'AI Summarizer', description: 'Summarize a PDF using your own AI provider key.', route: '/tools/ai-summarize', category: 'intelligence', icon: Sparkles, runtime: 'hybrid', status: 'coming-soon' },
  { id: 'translate-pdf', name: 'Translate PDF', description: 'Translate a PDF while preserving layout.', route: '/tools/translate-pdf', category: 'intelligence', icon: Languages, runtime: 'hybrid', status: 'coming-soon' },
];

export function toolsByCategory(id: CategoryId): Tool[] {
  return TOOLS.filter((t) => t.category === id);
}

export function findTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export const VISIBLE_CATEGORIES: Category[] = CATEGORIES.filter(
  (c) => c.id !== 'dashboard' && c.id !== 'settings',
);
