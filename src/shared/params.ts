import Ajv, { type ErrorObject, type JSONSchemaType } from "ajv";
import type { ParameterValues } from "./types.js";

export class ParameterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParameterValidationError";
  }
}

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

const parameterSchema: JSONSchemaType<ParameterValues> = {
  type: "object",
  additionalProperties: false,
  required: [
    "renderWidth",
    "renderHeight",
    "force",
    "scale",
    "silenceCutoffPercent",
    "gridSparseness",
    "showHeatmap",
    "vectorOverlayDensity",
    "spectralSlopeDbPerOct",
    "amplitudeContrast",
    "swirlDensity",
    "swirlMinimumAngleDegrees",
    "swirlStrengthPercent",
    "swirlFalloff",
    "swirlDirectionBias",
    "directionNoiseMix",
    "randomSeed",
  ],
  properties: {
    renderWidth: { type: "integer", minimum: 1 },
    renderHeight: { type: "integer", minimum: 1 },
    force: { type: "number" },
    scale: { type: "number" },
    silenceCutoffPercent: { type: "number" },
    gridSparseness: { type: "integer", minimum: 1 },
    showHeatmap: { type: "boolean" },
    vectorOverlayDensity: { type: "integer", minimum: 1 },
    spectralSlopeDbPerOct: { type: "number" },
    amplitudeContrast: { type: "number", minimum: 0 },
    swirlDensity: { type: "number" },
    swirlMinimumAngleDegrees: { type: "number" },
    swirlStrengthPercent: { type: "number" },
    swirlFalloff: { type: "number", minimum: 0 },
    swirlDirectionBias: { type: "number" },
    directionNoiseMix: { type: "number" },
    randomSeed: { type: "string" },
  },
};

const parameterSchemaValidator = new Ajv({
  allErrors: true,
  strict: true,
}).compile(parameterSchema);

export function parseParameters(parameters: unknown): ParameterValues {
  return validateParameters(parameters);
}

export function validateParameters(
  parameters: unknown,
): ParameterValues {
  if (!parameterSchemaValidator(parameters)) {
    throw new ParameterValidationError(
      formatParameterSchemaErrors(parameterSchemaValidator.errors),
    );
  }

  return { ...parameters };
}

function formatParameterSchemaErrors(
  errors: ErrorObject[] | null | undefined,
): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return "Invalid parameters";
  }

  const firstError = errors[0];

  if (firstError.keyword === "required") {
    const missingProperty = String(firstError.params.missingProperty);
    return `Missing required parameter: ${missingProperty}`;
  }

  const instancePath = firstError.instancePath.replace(/^\//, "");
  if (instancePath.length > 0 && firstError.message !== undefined) {
    return `Invalid parameter ${instancePath}: ${firstError.message}`;
  }

  return firstError.message ?? "Invalid parameters";
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
