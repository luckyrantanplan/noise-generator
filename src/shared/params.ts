import type { ParameterValues } from "./types.js";

export const MAX_TRACE_LENGTH = 1440;
export const MIN_TARGET_TURN_ANGLE_DEGREES = 0;
export const MAX_TARGET_TURN_ANGLE_DEGREES = 1440;
export const MAX_SPECTRAL_SLOPE_DB_PER_OCT = 12;
export const MIN_CUTOFF_PERCENT = 0;
export const MAX_CUTOFF_PERCENT = 100;
export const MIN_SILENCE_CUTOFF_PERCENT = 0;
export const MAX_SILENCE_CUTOFF_PERCENT = 100;

export const DEFAULT_PARAMETERS: ParameterValues = {
  renderWidth: 960,
  renderHeight: 720,
  maxTraceLength: 80,
  targetTurnAngleDegrees: 180,
  scale: 4.5,
  silenceCutoffPercent: 100,
  gridSparseness: 15,
  showHeatmap: true,
  vectorOverlayDensity: 16,
  spectralSlopeDbPerOct: 6,
  randomSeed: "field-001",
};

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
