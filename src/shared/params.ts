import type { ParameterValues } from "./types.js";

export const MAX_FORCE = 1440;
export const MAX_SPECTRAL_SLOPE_DB_PER_OCT = 12;
export const MIN_CUTOFF_PERCENT = 0;
export const MAX_CUTOFF_PERCENT = 100;
export const MIN_SILENCE_CUTOFF_PERCENT = 0;
export const MAX_SILENCE_CUTOFF_PERCENT = 100;
export const MIN_SWIRL_MINIMUM_ANGLE_DEGREES = 5;
export const MAX_SWIRL_MINIMUM_ANGLE_DEGREES = 180;
export const MAX_SWIRL_STRENGTH_PERCENT = 100;

export const DEFAULT_PARAMETERS: ParameterValues = {
  renderWidth: 960,
  renderHeight: 720,
  force: 80,
  scale: 4.5,
  silenceCutoffPercent: 100,
  gridSparseness: 15,
  showHeatmap: true,
  vectorOverlayDensity: 16,
  spectralSlopeDbPerOct: 6,
  amplitudeContrast: 1,
  swirlDensity: 18,
  swirlMinimumAngleDegrees: 180,
  swirlStrengthPercent: 60,
  swirlFalloff: 2,
  swirlDirectionBias: 0.5,
  directionNoiseMix: 0.45,
  randomSeed: "field-001",
};

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
