export type OutputQualityPreset = 'maximum' | 'balanced' | 'small' | 'custom';

export interface QualityPresetMeta {
  id: OutputQualityPreset;
  label: string;
  description: string;
  jpegQuality: number;
  dpi: number;
}

export const QUALITY_PRESETS: QualityPresetMeta[] = [
  {
    id: 'maximum',
    label: 'Maximum quality',
    description: 'Best fidelity for print, archive, and image-heavy files.',
    jpegQuality: 1,
    dpi: 300,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Good visual quality with practical file sizes.',
    jpegQuality: 0.86,
    dpi: 180,
  },
  {
    id: 'small',
    label: 'Small file',
    description: 'Prioritizes compact downloads for sharing.',
    jpegQuality: 0.62,
    dpi: 110,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Use the advanced controls below.',
    jpegQuality: 0.78,
    dpi: 150,
  },
];

export function getQualityPreset(id: OutputQualityPreset): QualityPresetMeta {
  return QUALITY_PRESETS.find((preset) => preset.id === id) || QUALITY_PRESETS[1];
}
