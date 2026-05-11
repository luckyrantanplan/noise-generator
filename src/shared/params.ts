import type { ParameterValues } from "./types.js";

export type NumericParameterKey = Exclude<
  keyof ParameterValues,
  "randomSeed" | "showHeatmap"
>;
export type BooleanParameterKey = Extract<keyof ParameterValues, "showHeatmap">;

export interface NumericParameterDefinition {
  key: NumericParameterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export interface SeedParameterDefinition {
  key: "randomSeed";
  label: string;
}

export interface BooleanParameterDefinition {
  key: BooleanParameterKey;
  label: string;
}

export type ParameterDefinition =
  | NumericParameterDefinition
  | BooleanParameterDefinition
  | SeedParameterDefinition;

export const DEFAULT_PARAMETERS: ParameterValues = {
  force: 26,
  magnitudeScale: 28,
  directionScale: 18,
  showHeatmap: true,
  vectorOverlayDensity: 16,
  heatmapCellSize: 1,
  octaves: 4,
  persistence: 0.55,
  lacunarity: 2,
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
  { key: "force", label: "Force", min: 0, max: 80, step: 1, integer: false },
  {
    key: "magnitudeScale",
    label: "Magnitude Scale",
    min: 4,
    max: 80,
    step: 1,
    integer: false,
  },
  {
    key: "directionScale",
    label: "Direction Scale",
    min: 4,
    max: 80,
    step: 1,
    integer: false,
  },
  { key: "showHeatmap", label: "Show Heatmap" },
  {
    key: "vectorOverlayDensity",
    label: "Vector Overlay Density",
    min: 1,
    max: 64,
    step: 1,
    integer: true,
  },
  {
    key: "heatmapCellSize",
    label: "Heatmap Cell Size",
    min: 1,
    max: 16,
    step: 1,
    integer: true,
  },
  { key: "octaves", label: "Octaves", min: 1, max: 8, step: 1, integer: true },
  {
    key: "persistence",
    label: "Persistence",
    min: 0.05,
    max: 0.95,
    step: 0.01,
    integer: false,
  },
  {
    key: "lacunarity",
    label: "Lacunarity",
    min: 1.2,
    max: 4,
    step: 0.05,
    integer: false,
  },
  {
    key: "amplitudeContrast",
    label: "Amplitude Contrast",
    min: 0.25,
    max: 4,
    step: 0.05,
    integer: false,
  },
  {
    key: "amplitudeMin",
    label: "Amplitude Range Min",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "amplitudeMax",
    label: "Amplitude Range Max",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "swirlDensity",
    label: "Swirl Density",
    min: 0,
    max: 80,
    step: 1,
    integer: false,
  },
  {
    key: "swirlRadius",
    label: "Swirl Radius",
    min: 0.03,
    max: 0.45,
    step: 0.01,
    integer: false,
  },
  {
    key: "swirlStrength",
    label: "Swirl Strength",
    min: 0,
    max: 4,
    step: 0.05,
    integer: false,
  },
  {
    key: "swirlFalloff",
    label: "Swirl Falloff",
    min: 0.3,
    max: 5,
    step: 0.05,
    integer: false,
  },
  {
    key: "swirlDirectionRandomness",
    label: "Swirl Direction Randomness",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    key: "directionNoiseMix",
    label: "Direction Noise Mix",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  { key: "randomSeed", label: "Random Seed" },
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
