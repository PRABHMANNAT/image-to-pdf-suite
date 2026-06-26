import Cropper, { Area, Point } from 'react-easy-crop';
import { cn } from '../../lib/cn';

interface Props {
  src: string;
  crop: Point;
  zoom: number;
  rotation: number;
  aspect?: number;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onRotationChange?: (rotation: number) => void;
  onCropComplete: (croppedAreaPixels: Area) => void;
  className?: string;
  showGrid?: boolean;
  /** Flip without re-rendering the parent image element — handled via transform. */
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

// Wrapper around react-easy-crop. Centralises the styling so every tool that
// needs visual cropping looks identical.
export function ImageCropper({
  src,
  crop,
  zoom,
  rotation,
  aspect,
  onCropChange,
  onZoomChange,
  onRotationChange,
  onCropComplete,
  className,
  showGrid = true,
  flipHorizontal,
  flipVertical,
}: Props) {
  const transform =
    flipHorizontal || flipVertical
      ? `translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${zoom}) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`
      : undefined;

  return (
    <div
      className={cn(
        'relative w-full aspect-[4/3] sm:aspect-[16/10] rounded-2xl overflow-hidden bg-slate-900',
        className,
      )}
    >
      <Cropper
        image={src}
        crop={crop}
        zoom={zoom}
        rotation={rotation}
        aspect={aspect}
        onCropChange={onCropChange}
        onZoomChange={onZoomChange}
        onRotationChange={onRotationChange}
        onCropComplete={(_area, areaPixels) => onCropComplete(areaPixels)}
        showGrid={showGrid}
        objectFit="contain"
        restrictPosition
        transform={transform}
      />
    </div>
  );
}
