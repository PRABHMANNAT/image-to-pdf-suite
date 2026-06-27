import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Transformer } from 'react-konva';
import Konva from 'konva';
import type { Overlay, Tool } from '../../lib/editorTypes';
import { loadImageElement } from '../../lib/imageUtils';

interface Props {
  bgDataUrl: string;
  widthPx: number;
  heightPx: number;
  overlays: Overlay[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: Overlay[]) => void;
  /** Called when the user adds something via a click in canvas-pixel coords. */
  onCanvasClick?: (px: { x: number; y: number }) => void;
  tool: Tool;
}

function HtmlImage({ src, ...rest }: { src: string } & Omit<React.ComponentProps<typeof KonvaImage>, 'image'>) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadImageElement(src).then((el) => {
      if (!cancelled) setImg(el);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (!img) return null;
  return <KonvaImage image={img} {...rest} />;
}

export function PageCanvas({
  bgDataUrl,
  widthPx,
  heightPx,
  overlays,
  selectedId,
  onSelect,
  onChange,
  onCanvasClick,
  tool,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(bgDataUrl).then((el) => {
      if (!cancelled) setBgImg(el);
    });
    return () => {
      cancelled = true;
    };
  }, [bgDataUrl]);

  // Bind the transformer to the currently selected shape.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (selectedId) {
      const node = shapeRefs.current.get(selectedId);
      if (node) {
        tr.nodes([node]);
        tr.getLayer()?.batchDraw();
        return;
      }
    }
    tr.nodes([]);
    tr.getLayer()?.batchDraw();
  }, [selectedId, overlays]);

  function patch(id: string, partial: Partial<Overlay>) {
    onChange(overlays.map((o) => (o.id === id ? ({ ...o, ...partial } as Overlay) : o)));
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    // Clicking the empty background deselects.
    if (e.target === e.target.getStage() || e.target.name() === 'bg') {
      onSelect(null);
      if (onCanvasClick && tool !== 'select') {
        const pos = e.target.getStage()?.getPointerPosition();
        if (pos) onCanvasClick(pos);
      }
    }
  }

  return (
    <div className="inline-block rounded-xl overflow-hidden shadow-soft dark:shadow-soft-dark bg-white">
      <Stage
        ref={stageRef}
        width={widthPx}
        height={heightPx}
        onMouseDown={handleStageClick}
        onTouchStart={handleStageClick}
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
      >
        <Layer listening={false}>
          {bgImg && <KonvaImage image={bgImg} name="bg" width={widthPx} height={heightPx} />}
        </Layer>
        <Layer>
          {overlays.map((o) => {
            const common = {
              x: o.x,
              y: o.y,
              rotation: o.rotation ?? 0,
              draggable: tool === 'select',
              onClick: () => onSelect(o.id),
              onTap: () => onSelect(o.id),
              onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
                patch(o.id, { x: e.target.x(), y: e.target.y() } as Partial<Overlay>);
              },
              onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
                const node = e.target as Konva.Node;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                if (o.kind === 'text') {
                  patch(o.id, {
                    x: node.x(),
                    y: node.y(),
                    fontSize: Math.max(4, (o as { fontSize: number }).fontSize * scaleY),
                    rotation: node.rotation(),
                  } as Partial<Overlay>);
                } else if (o.kind === 'rect' || o.kind === 'highlight' || o.kind === 'image') {
                  patch(o.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(1, (o as { width: number }).width * scaleX),
                    height: Math.max(1, (o as { height: number }).height * scaleY),
                    rotation: node.rotation(),
                  } as Partial<Overlay>);
                } else if (o.kind === 'line') {
                  // Lines: scale endpoint relative to start.
                  const dx = (o as LineRefLike).ex - o.x;
                  const dy = (o as LineRefLike).ey - o.y;
                  patch(o.id, {
                    x: node.x(),
                    y: node.y(),
                    ex: node.x() + dx * scaleX,
                    ey: node.y() + dy * scaleY,
                  } as Partial<Overlay>);
                }
              },
              ref: (node: Konva.Node | null) => {
                if (node) shapeRefs.current.set(o.id, node);
                else shapeRefs.current.delete(o.id);
              },
            };
            if (o.kind === 'text') {
              return (
                <Text
                  key={o.id}
                  {...common}
                  text={o.text}
                  fontSize={o.fontSize}
                  fill={o.color}
                  width={o.width}
                />
              );
            }
            if (o.kind === 'rect') {
              return (
                <Rect
                  key={o.id}
                  {...common}
                  width={o.width}
                  height={o.height}
                  fill={o.fill}
                  stroke={o.stroke}
                  strokeWidth={o.strokeWidth}
                  opacity={o.opacity}
                />
              );
            }
            if (o.kind === 'highlight') {
              return (
                <Rect
                  key={o.id}
                  {...common}
                  width={o.width}
                  height={o.height}
                  fill={o.fill}
                  opacity={o.opacity}
                />
              );
            }
            if (o.kind === 'line') {
              // Use Line at origin; absolute coords as points.
              return (
                <Line
                  key={o.id}
                  {...common}
                  x={0}
                  y={0}
                  points={[o.x, o.y, o.ex, o.ey]}
                  stroke={o.stroke}
                  strokeWidth={o.strokeWidth}
                  lineCap="round"
                  hitStrokeWidth={Math.max(8, o.strokeWidth + 6)}
                  onDragEnd={(e) => {
                    // Lines move via offset of the entire group — translate both points.
                    const node = e.target;
                    const dx = node.x();
                    const dy = node.y();
                    if (!dx && !dy) return;
                    patch(o.id, {
                      x: o.x + dx,
                      y: o.y + dy,
                      ex: o.ex + dx,
                      ey: o.ey + dy,
                    } as Partial<Overlay>);
                    node.position({ x: 0, y: 0 });
                  }}
                />
              );
            }
            if (o.kind === 'image') {
              return (
                <HtmlImage
                  key={o.id}
                  {...common}
                  src={o.src}
                  width={o.width}
                  height={o.height}
                />
              );
            }
            return null;
          })}
          <Transformer
            ref={trRef}
            rotateEnabled
            borderStroke="#3b82f6"
            anchorStroke="#3b82f6"
            anchorFill="#fff"
            keepRatio={false}
          />
        </Layer>
      </Stage>
    </div>
  );
}

// Helper alias to keep the line-overlay narrowing tidy without an explicit `as`.
type LineRefLike = { ex: number; ey: number };
