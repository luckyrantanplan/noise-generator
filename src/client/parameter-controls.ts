import {
  DEFAULT_PARAMETERS,
  MAX_CUTOFF_PERCENT,
  MAX_SILENCE_CUTOFF_PERCENT,
  MAX_SPECTRAL_SLOPE_DB_PER_OCT,
  MAX_TARGET_TURN_ANGLE_DEGREES,
  MAX_TRACE_LENGTH,
  MIN_CUTOFF_PERCENT,
  MIN_SILENCE_CUTOFF_PERCENT,
  MIN_TARGET_TURN_ANGLE_DEGREES,
} from "../shared/params.js";
import type { ParameterValues } from "../shared/types.js";

export type NumericParameterKey = Exclude<
  keyof ParameterValues,
  "randomSeed" | "showHeatmap"
>;
export type BooleanParameterKey = Extract<keyof ParameterValues, "showHeatmap">;

export const PARAMETER_GROUPS = [
  {
    key: "source",
    label: "Source Field",
    description:
      "Controls for the scalar field whose isolines are traced into vectors.",
  },
  {
    key: "tracing",
    label: "Tracing",
    description:
      "Controls for how far each isoline is followed and how much it is allowed to turn.",
  },
  {
    key: "display",
    label: "Display",
    description: "Controls for SVG resolution and visible overlays.",
  },
  {
    key: "seed",
    label: "Seed",
    description: "Deterministic input used to reproduce the same field.",
  },
] as const;

export type ParameterGroupKey = (typeof PARAMETER_GROUPS)[number]["key"];

export interface NumericParameterDefinition {
  group: ParameterGroupKey;
  key: NumericParameterKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export interface SeedParameterDefinition {
  group: ParameterGroupKey;
  key: "randomSeed";
  label: string;
  description: string;
}

export interface BooleanParameterDefinition {
  group: ParameterGroupKey;
  key: BooleanParameterKey;
  label: string;
  description: string;
}

export type ParameterDefinition =
  | NumericParameterDefinition
  | BooleanParameterDefinition
  | SeedParameterDefinition;

const MAX_RENDER_WIDTH = 1920;
const MAX_RENDER_HEIGHT = 1440;

export const PARAMETER_DEFINITIONS: ParameterDefinition[] = [
  {
    group: "display",
    key: "renderWidth",
    label: "Render Width",
    description:
      "Sets the SVG output width in SVG units. This also affects the simulation grid size when combined with grid sparseness.",
    min: 1,
    max: MAX_RENDER_WIDTH,
    step: 10,
    integer: true,
  },
  {
    group: "display",
    key: "renderHeight",
    label: "Render Height",
    description:
      "Sets the SVG output height in SVG units. This also affects the simulation grid size when combined with grid sparseness.",
    min: 1,
    max: MAX_RENDER_HEIGHT,
    step: 10,
    integer: true,
  },
  {
    group: "tracing",
    key: "maxTraceLength",
    label: "Max Trace Length",
    description:
      "Maximum isoline arc length walked from each start sample before the trace is truncated. The final displacement is the endpoint offset after this walk.",
    min: 0,
    max: MAX_TRACE_LENGTH,
    step: 1,
    integer: false,
  },
  {
    group: "tracing",
    key: "targetTurnAngleDegrees",
    label: "Target Turn Angle (deg)",
    description:
      "Stop tracing once the net turning angle from the initial isoline direction reaches this threshold, unless the max trace length is hit first.",
    min: MIN_TARGET_TURN_ANGLE_DEGREES,
    max: MAX_TARGET_TURN_ANGLE_DEGREES,
    step: 1,
    integer: false,
  },
  {
    group: "source",
    key: "scale",
    label: "Scale (%)",
    description:
      "Sets the cutoff radius as a percentage of the longest grid side for the scalar source field. Higher percentages preserve finer contour detail; lower percentages produce broader, smoother isolines.",
    min: MIN_CUTOFF_PERCENT,
    max: MAX_CUTOFF_PERCENT,
    step: 0.1,
    integer: false,
  },
  {
    group: "source",
    key: "silenceCutoffPercent",
    label: "Fsilence (%)",
    description:
      "Hard cutoff as a percent of the longest grid side for the scalar source field. Frequencies above this radius are forced to zero.",
    min: MIN_SILENCE_CUTOFF_PERCENT,
    max: MAX_SILENCE_CUTOFF_PERCENT,
    step: 0.1,
    integer: false,
  },
  {
    group: "source",
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
    group: "display",
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
    group: "display",
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
    group: "display",
    key: "showHeatmap",
    label: "Show Heatmap",
    description:
      "Toggles the colored source-noise heatmap. Disable it to render only traced vectors and the scale bar.",
  },
  {
    group: "seed",
    key: "randomSeed",
    label: "Random Seed",
    description:
      "Seed for deterministic generation. Reuse the same seed and parameter values to reproduce the same field.",
  },
];

export function normalizeParameters(
  parameters: ParameterValues,
): ParameterValues {
  const normalizedParameters: ParameterValues = {
    ...parameters,
    randomSeed: sanitizeSeed(
      typeof parameters.randomSeed === "string"
        ? parameters.randomSeed
        : DEFAULT_PARAMETERS.randomSeed,
    ),
    showHeatmap:
      typeof parameters.showHeatmap === "boolean"
        ? parameters.showHeatmap
        : DEFAULT_PARAMETERS.showHeatmap,
  };

  for (const definition of PARAMETER_DEFINITIONS) {
    if (definition.key === "randomSeed" || definition.key === "showHeatmap") {
      continue;
    }

    normalizedParameters[definition.key] = normalizeNumericValue(
      normalizedParameters[definition.key],
      definition,
    );
  }

  return normalizedParameters;
}

function normalizeNumericValue(
  suppliedValue: number,
  definition: NumericParameterDefinition,
): number {
  const fallbackValue = DEFAULT_PARAMETERS[definition.key];
  const finiteNumber = Number.isFinite(suppliedValue)
    ? suppliedValue
    : fallbackValue;
  const roundedNumber = definition.integer
    ? Math.round(finiteNumber)
    : finiteNumber;
  return Math.min(definition.max, Math.max(definition.min, roundedNumber));
}

function sanitizeSeed(seed: string): string {
  const trimmedSeed = seed.trim();
  if (trimmedSeed.length === 0) {
    return DEFAULT_PARAMETERS.randomSeed;
  }
  return trimmedSeed.slice(0, 120);
}
