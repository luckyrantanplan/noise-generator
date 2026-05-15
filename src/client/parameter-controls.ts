import {
  DEFAULT_PARAMETERS,
  MAX_CUTOFF_PERCENT,
  MAX_FORCE,
  MAX_SILENCE_CUTOFF_PERCENT,
  MAX_SPECTRAL_SLOPE_DB_PER_OCT,
  MAX_SWIRL_MINIMUM_ANGLE_DEGREES,
  MAX_SWIRL_STRENGTH_PERCENT,
  MIN_CUTOFF_PERCENT,
  MIN_SILENCE_CUTOFF_PERCENT,
  MIN_SWIRL_MINIMUM_ANGLE_DEGREES,
} from "../shared/params.js";
import type { ParameterValues } from "../shared/types.js";

export type NumericParameterKey = Exclude<
  keyof ParameterValues,
  "randomSeed" | "showHeatmap"
>;
export type BooleanParameterKey = Extract<keyof ParameterValues, "showHeatmap">;

export const PARAMETER_GROUPS = [
  {
    key: "field",
    label: "Field Shape",
    description:
      "Primary controls for structure, magnitude, and base direction.",
  },
  {
    key: "swirls",
    label: "Swirls",
    description: "Controls for vortex placement, footprint, and spin behavior.",
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
    group: "field",
    key: "force",
    label: "Force",
    description:
      "Maximum allowed displacement magnitude in SVG units. It caps the noise contribution directly and sets the maximum swirl angle budget used by the field generator.",
    min: 0,
    max: MAX_FORCE,
    step: 1,
    integer: false,
  },
  {
    group: "field",
    key: "scale",
    label: "Scale (%)",
    description:
      "Sets the shared cutoff as a percentage of the longest grid side for both magnitude and direction fields. Higher percentages preserve finer detail; lower percentages produce smoother, broader structure.",
    min: MIN_CUTOFF_PERCENT,
    max: MAX_CUTOFF_PERCENT,
    step: 0.1,
    integer: false,
  },
  {
    group: "field",
    key: "silenceCutoffPercent",
    label: "Fsilence (%)",
    description:
      "Hard cutoff as a percent of the longest grid side for both magnitude and direction fields. Frequencies above this radius are forced to zero.",
    min: MIN_SILENCE_CUTOFF_PERCENT,
    max: MAX_SILENCE_CUTOFF_PERCENT,
    step: 0.1,
    integer: false,
  },
  {
    group: "field",
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
    group: "field",
    key: "amplitudeContrast",
    label: "Amplitude Contrast",
    description:
      "Applies contrast to the normalized magnitude field before it is used as amplitude. Higher values push more cells toward extremes.",
    min: 0.25,
    max: 4,
    step: 0.05,
    integer: false,
  },
  {
    group: "field",
    key: "directionNoiseMix",
    label: "Direction Noise Mix",
    description:
      "Controls how strongly noise is attenuated near swirl centers. At 0, the noise fades radially to 0 at the center of each swirl; at 1, the noise keeps full strength everywhere while the swirl displacement is still added.",
    min: 0,
    max: 1,
    step: 0.01,
    integer: false,
  },
  {
    group: "swirls",
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
    group: "swirls",
    key: "swirlMinimumAngleDegrees",
    label: "Swirl Min Angle (deg)",
    description:
      "Minimum allowable swirl angle in degrees. Higher values force smaller maximum swirl circles because Force must still bound the worst-case chord length.",
    min: MIN_SWIRL_MINIMUM_ANGLE_DEGREES,
    max: MAX_SWIRL_MINIMUM_ANGLE_DEGREES,
    step: 1,
    integer: false,
  },
  {
    group: "swirls",
    key: "swirlStrengthPercent",
    label: "Swirl Strength (% max angle)",
    description:
      "Requested swirl intensity as a percentage of the maximum angle allowed for each sampled circle under Force. 100 means use the full force-limited angle budget of that swirl; lower values request a proportionally weaker swirl.",
    min: 0,
    max: MAX_SWIRL_STRENGTH_PERCENT,
    step: 1,
    integer: false,
  },
  {
    group: "swirls",
    key: "swirlFalloff",
    label: "Swirl Falloff",
    description:
      "Controls how abruptly the swirl angle fades to zero near the circle boundary. Higher values keep a flatter interior and a sharper drop close to the edge.",
    min: 0.3,
    max: 5,
    step: 0.05,
    integer: false,
  },
  {
    group: "swirls",
    key: "swirlDirectionBias",
    label: "Swirl Direction Bias",
    description:
      "Biases swirl spin direction. 0 favors clockwise swirls, 0.5 yields a balanced mix, and 1 favors counterclockwise swirls.",
    min: 0,
    max: 1,
    step: 0.01,
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
      "Toggles the colored magnitude heatmap. Disable it to render only vectors, swirl guides, and the scale bar.",
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