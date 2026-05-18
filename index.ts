import {
  generateDisplacementField,
  generateFieldArtifacts,
} from "./src/field/composeField.js";
import { createGridFromSparseness } from "./src/field/grid.js";
import { DEFAULT_PARAMETERS } from "./src/shared/params.js";
import {
  PARAMETER_DEFINITIONS,
  PARAMETER_GROUPS,
  normalizeParameters,
} from "./src/client/parameter-controls.js";
import { validateParameters } from "./src/server/parameterValidation.js";
import { renderFieldSvg } from "./src/server/renderSvg.js";
import type {
  BooleanParameterDefinition,
  NumericParameterDefinition,
  ParameterDefinition,
  ParameterGroupKey,
  SeedParameterDefinition,
} from "./src/client/parameter-controls.js";
import type { ParameterValues } from "./src/shared/types.js";

export {
  DEFAULT_PARAMETERS,
  generateDisplacementField,
  normalizeParameters,
  PARAMETER_DEFINITIONS,
  PARAMETER_GROUPS,
  validateParameters,
};
export type {
  BooleanParameterDefinition,
  NumericParameterDefinition,
  ParameterDefinition,
  ParameterGroupKey,
  ParameterValues,
  SeedParameterDefinition,
};

export interface GeneratedDisplacementPreview {
  readonly parameters: ParameterValues;
  readonly svg: string;
}

export function generateDisplacementPreview(
  parameters: Partial<ParameterValues>,
): GeneratedDisplacementPreview {
  const normalizedParameters = validateParameters({
    ...DEFAULT_PARAMETERS,
    ...parameters,
  });
  const grid = createGridFromSparseness(
    normalizedParameters.renderWidth,
    normalizedParameters.renderHeight,
    normalizedParameters.gridSparseness,
  );
  const field = generateFieldArtifacts(normalizedParameters, grid);

  return {
    parameters: normalizedParameters,
    svg: renderFieldSvg(field, {
      width: normalizedParameters.renderWidth,
      height: normalizedParameters.renderHeight,
      showHeatmap: normalizedParameters.showHeatmap,
      vectorOverlayDensity: normalizedParameters.vectorOverlayDensity,
    }),
  };
}
