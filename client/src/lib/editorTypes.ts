// Domain types shared between the Edit PDF page and the konva editor.
// Stored coordinates are in EDITOR PIXEL space at the page's render scale.
// Conversion to PT happens at export time by dividing by the scale.

export type OverlayKind = 'text' | 'rect' | 'highlight' | 'line' | 'image';

interface OverlayBase {
  id: string;
  kind: OverlayKind;
  x: number;
  y: number;
  rotation?: number;
}

export interface TextOverlay extends OverlayBase {
  kind: 'text';
  text: string;
  fontSize: number;
  color: string;
  width?: number; // for wrapping bounds; absent = auto
}

export interface RectOverlay extends OverlayBase {
  kind: 'rect';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface HighlightOverlay extends OverlayBase {
  kind: 'highlight';
  width: number;
  height: number;
  fill: string;
  opacity: number;
}

export interface LineOverlay extends OverlayBase {
  kind: 'line';
  /** Second endpoint relative to the page (not relative to x,y). */
  ex: number;
  ey: number;
  stroke: string;
  strokeWidth: number;
}

export interface ImageOverlay extends OverlayBase {
  kind: 'image';
  /** Data URL — embedded directly in the document. */
  src: string;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

export type Overlay = TextOverlay | RectOverlay | HighlightOverlay | LineOverlay | ImageOverlay;

export interface EditorPage {
  pageNumber: number;
  thumbDataUrl: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
}

export type Tool = 'select' | 'text' | 'rect' | 'highlight' | 'line' | 'image';
