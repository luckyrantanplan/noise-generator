import type { ParameterValues } from "./types.js";

export type NumericParameterKey = Exclude<
  keyof ParameterValues,
  "randomSeed" | "showHeatmap"
>;
export type BooleanParameterKey = Extract<keyof ParameterValues, "showHeatmap">;

export interface NumericParameterDefinition {
  key: NumericParameterKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export interface SeedParameterDefinition {
  key: "randomSeed";
  label: string;
  description: string;
}

export interface BooleanParameterDefinition {
  key: BooleanParameterKey;
  label: string;
  description: string;
}

export type ParameterDefinition =
  | NumericParameterDefinition
  | BooleanParameterDefinition
  | SeedParameterDefinition;

export const MAX_FORCE = 80;
export const MAX_SPECTRAL_SLOPE_DB_PER_OCT = 12;

export const DEFAULT_PARAMETERS: ParameterValues = {
  force: 26,
  magnitudeScale: 28,
  directionScale: 18,
  gridSparseness: 15,
  showHeatmap: true,
  vectorOverlayDensity: 16,
  spectralSlopeDbPerOct: 6,
  amplitudeContrast: 1.4,
  amplitudeMin: 0.08,
  amplitudeMax: 1,
  swirlDensity: 18,
  swirlRadius: 0.18,
  swirlStrength: 1.4,
  swirlFalloff: 2,
  swirlDirectionRandomness: 0.75,
  directionNoiseMix: 0.45,
  randomSeed: "field-001",
};

export const PARAMETER_DEFINITIONS: ParameterDefinition[] = [
  {
    key: "force",
    label: "Force",
    description:
      "Scales the final displacement magnitude. Higher values produce longer arrows and a more intense field.",
    min: 0,
    max: MAX_FORCE,
    step: 1,
    integer: false,
  },
  {
    key: "magnitudeScale",
    label: "Magnitude Scale",
    description:
      "Sets the characteristic scale of the magnitude spectrum. Higher values shift energy toward broader structures; lower values preserve finer detail.",
    min: 4,
    max: 80,
    step: 1,
    integer: false,
  },
  {
    key: "directionScale",
    label: "Direction Scale",
    description:
      "Sets the characteristic scale of the direction spectrum. Higher values produce smoother directional flow; lower values make direction change faster.",
    min: 4,
    max: 80,
    step: 1,
    integer: false,
  },
  {
    key: "gridSparseness",
    label: "Grid Sparseness",
    description:
      "Sets the simulation cell size in SVG units. A value of 1 means one grid column per SVG unit; larger values make the field coarser with fewer columns and rows.",
    min: 1,
    max: 120,
    step: 1,
    integer: true,
  },
  {
    key: "showHeatmap",
    label: "Show Heatmap",
    description:
      "Toggles the colored magnitude heatmap. Disable it to render only vectors, swirl guides, and the scale bar.",
  },
  {
    key: "vectorOverlayDensity",
    label: "Vector Overlay Density",
    description:
      "Controls how many arrows are drawn over the field. Higher values sample the field more densely; lower values skip more cells.",
    min: 1,
    max: 64,
    step: 1,
    integer: true,
  },
  {
    key: "spectralSlopeDbPerOct",
    label: "Spectral Slope",
    description:
      "Sets the spectral rolloff in dB per octave. 0 is white noise, about 3 is pink, and about 6 is brown; higher values produce smoother large-scale variation.",
    min: 0,
    max: MAX_SPECTRAL_SLOPE_DB_PER_OCT,
    step: 0.1,
    integer: false,
  },
  {
    key: "amplitudeContrast",
    label: "Amplitude Contrast",
    description:
      "Applies contrast to the normalized magnitude field before remapping it into the output range. Higher values push more cells toward extremes.",
    min: 0.25,
    max: 4,
    step: 0.05,
    integer: false,
  },
  {
    key: "amplitudeMin",
    label: "Amplitude Range Min",
    description:
      "Lower bound of the final displacement magnitude after shaping. Increase it to keep more motion in low-energy areas.",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "amplitudeMax",
    label: "Amplitude Range Max",
    description:
      "Upper bound of the final displacement magnitude after shaping. Lower it to cap the strongest regions in the field.",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "swirlDensity",
    label: "Swirl Density",
    description:
      "Approximate density of circular swirl influences placed across the field. Higher values create more swirl centers.",
    min: 0,
    max: 80,
    step: 1,
    integer: false,
  },
  {
    key: "swirlRadius",
    label: "Swirl Radius",
    description:
      "Radius of each swirl influence as a fraction of the shorter render side. Larger values make each swirl affect a wider area.",
    min: 0.03,
    max: 0.45,
    step: 0.01,
    integer: false,
  },
  {
    key: "swirlStrength",
    label: "Swirl Strength",
    description:
      "Strength of the swirl-induced rotation mixed into the direction field. Higher values bend the flow more strongly around swirl centers.",
    min: 0,
    max: 4,
    step: 0.05,
    integer: false,
  },
  {
    key: "swirlFalloff",
    label: "Swirl Falloff",
    description:
      "Controls how quickly each swirl influence fades with distance. Higher values keep the effect concentrated closer to the center.",
    min: 0.3,
    max: 5,
    step: 0.05,
    integer: false,
  },
  {
    key: "swirlDirectionRandomness",
    label: "Swirl Direction Randomness",
    description:
      "Controls how randomly swirl directions flip between clockwise and counterclockwise. Lower values make the pattern more uniform.",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "directionNoiseMix",
    label: "Direction Noise Mix",
    description:
      "Blends the noise-derived direction field with the swirl-derived field. Higher values preserve more noise direction; lower values let swirls dominate.",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "randomSeed",
    label: "Random Seed",
    description:
      "Seed for deterministic generation. Reuse the same seed and parameter values to reproduce the same field.",
  },
];

export function parseParameters(
  searchParams: URLSearchParams,
): ParameterValues {
  const parsedValues: ParameterValues = { ...DEFAULT_PARAMETERS };

  for (const definition of PARAMETER_DEFINITIONS) {
    const suppliedValue = searchParams.get(definition.key);
    if (suppliedValue === null) {
      continue;
    }

    if (definition.key === "randomSeed") {
      parsedValues.randomSeed = sanitizeSeed(suppliedValue);
      continue;
    }

    if (definition.key === "showHeatmap") {
      parsedValues.showHeatmap = parseBooleanValue(suppliedValue);
      continue;
    }

    parsedValues[definition.key] = parseNumericValue(suppliedValue, definition);
  }

  if (parsedValues.amplitudeMin > parsedValues.amplitudeMax) {
    const previousMinimum = parsedValues.amplitudeMin;
    parsedValues.amplitudeMin = parsedValues.amplitudeMax;
    parsedValues.amplitudeMax = previousMinimum;
  }

  return parsedValues;
}

export function serializeParameters(
  parameters: ParameterValues,
): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const definition of PARAMETER_DEFINITIONS) {
    searchParams.set(definition.key, String(parameters[definition.key]));
  }
  return searchParams;
}

function parseNumericValue(
  suppliedValue: string,
  definition: NumericParameterDefinition,
): number {
  const parsedNumber = Number(suppliedValue);
  const fallbackValue = DEFAULT_PARAMETERS[definition.key];
  const finiteNumber = Number.isFinite(parsedNumber)
    ? parsedNumber
    : fallbackValue;
  const roundedNumber = definition.integer
    ? Math.round(finiteNumber)
    : finiteNumber;
  return clamp(roundedNumber, definition.min, definition.max);
}

function parseBooleanValue(suppliedValue: string): boolean {
  const normalizedValue = suppliedValue.trim().toLowerCase();
  return !(
    normalizedValue === "false" ||
    normalizedValue === "0" ||
    normalizedValue === "off" ||
    normalizedValue === "no"
  );
}

function sanitizeSeed(seed: string): string {
  const trimmedSeed = seed.trim();
  if (trimmedSeed.length === 0) {
    return DEFAULT_PARAMETERS.randomSeed;
  }
  return trimmedSeed.slice(0, 120);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
