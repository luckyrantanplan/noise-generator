import Ajv, { type ErrorObject, type JSONSchemaType } from "ajv";

import type { ParameterValues } from "../shared/types.js";

export class ParameterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParameterValidationError";
  }
}

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

export function validateParameters(parameters: unknown): ParameterValues {
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
