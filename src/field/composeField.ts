import { DEFAULT_PARAMETERS } from "../shared/params.js";
import type {
  GridSpec,
  ScalarField,
  ParameterValues,
  VectorField,
} from "../shared/types.js";
import {
  DEFAULT_GRID,
  createGrid,
  createGridFromSparseness,
  normalizedCoordinate,
} from "./grid.js";
import { SeededRandom } from "./hashSeed.js";
import { traceIsolineFromPoint, type TraceOptions } from "./isolineTracing.js";
import { generateWhiteNoise, applySpectralFilter } from "./spectralNoise.js";

export interface FieldArtifacts {
  scalarField: ScalarField;
  vectorField: VectorField;
}

export function generateDisplacementField(
  parameters: ParameterValues,
): VectorField {
  const grid = createGridFromSparseness(
    parameters.renderWidth,
    parameters.renderHeight,
    parameters.gridSparseness,
  );

  return generateVectorField(parameters, grid);
}

export function generateFieldArtifacts(
  parameters: ParameterValues,
  suppliedGrid: GridSpec,
): FieldArtifacts {
  const grid = createGrid(suppliedGrid.width, suppliedGrid.height);
  const scalarField = generateScalarField(parameters, grid);
  const vectorField = generateVectorFieldFromScalarField(
    parameters,
    grid,
    scalarField,
  );

  return {
    scalarField,
    vectorField,
  };
}

export function generateVectorField(
  parameters: ParameterValues,
  suppliedGrid: GridSpec,
): VectorField {
  const { vectorField } = generateFieldArtifacts(parameters, suppliedGrid);

  return vectorField;
}

function generateVectorFieldFromScalarField(
  parameters: ParameterValues,
  grid: GridSpec,
  scalarField: ScalarField,
): VectorField {
  const direction = new Float32Array(grid.width * grid.height);
  const displacementX = new Float32Array(grid.width * grid.height);
  const displacementY = new Float32Array(grid.width * grid.height);
  const magnitude = new Float32Array(grid.width * grid.height);
  const targetTurnAngleDegrees = parameters.targetTurnAngleDegrees;
  const maxTraceLength = parameters.maxTraceLength;
  const traceOptions: TraceOptions = {
    renderWidth: parameters.renderWidth,
    renderHeight: parameters.renderHeight,
    targetTurnAngleDegrees,
    maxTraceLength,
  };

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const scalarIndex = rowIndex * grid.width + columnIndex;
      const startPoint = {
        x:
          normalizedCoordinate(columnIndex, grid.width) *
          parameters.renderWidth,
        y:
          normalizedCoordinate(rowIndex, grid.height) * parameters.renderHeight,
      };
      const trace = traceIsolineFromPoint(
        scalarField,
        startPoint,
        traceOptions,
      );
      const endPoint = trace.path[trace.path.length - 1] ?? startPoint;
      const vectorX = endPoint.x - startPoint.x;
      const vectorY = endPoint.y - startPoint.y;

      displacementX[scalarIndex] = vectorX;
      displacementY[scalarIndex] = vectorY;
      magnitude[scalarIndex] = Math.hypot(vectorX, vectorY);
      direction[scalarIndex] = Math.atan2(vectorY, vectorX);
    }
  }

  return {
    grid,
    direction,
    displacementX,
    displacementY,
    magnitude,
    maximumDisplacementMagnitude: maxTraceLength,
  };
}

function generateScalarField(
  parameters: ParameterValues,
  grid: GridSpec,
): ScalarField {
  const scalarRandom = new SeededRandom(`${parameters.randomSeed}:scalar`);
  const scalarNoise = generateWhiteNoise(grid, scalarRandom);
  return applySpectralFilter(scalarNoise, {
    cutoffPercent: parameters.scale,
    silenceCutoffPercent: parameters.silenceCutoffPercent,
    spectralSlopeDbPerOct: parameters.spectralSlopeDbPerOct,
  });
}

export function generateDefaultVectorField(): VectorField {
  return generateVectorField(DEFAULT_PARAMETERS, DEFAULT_GRID);
}
