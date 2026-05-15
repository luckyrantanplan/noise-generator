import { DEFAULT_PARAMETERS } from "../shared/params.js";
import type {
  GridSpec,
  ParameterValues,
  VectorField,
} from "../shared/types.js";
import { shapeAmplitudeField } from "./amplitude.js";
import { DEFAULT_GRID, createGrid, createGridFromSparseness } from "./grid.js";
import { sampleSwirlCenters } from "./poissonDisk.js";
import { SeededRandom } from "./hashSeed.js";
import { generateWhiteNoise, applySpectralFilter } from "./spectralNoise.js";
import { evaluateSwirlInfluence } from "./swirls.js";

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

export function generateVectorField(
  parameters: ParameterValues,
  suppliedGrid: GridSpec,
): VectorField {
  const grid = createGrid(suppliedGrid.width, suppliedGrid.height);
  const magnitudeRandom = new SeededRandom(
    `${parameters.randomSeed}:magnitude`,
  );
  const directionRandom = new SeededRandom(
    `${parameters.randomSeed}:direction`,
  );
  const swirlRandom = new SeededRandom(`${parameters.randomSeed}:swirls`);

  const magnitudeNoise = generateWhiteNoise(grid, magnitudeRandom);
  const directionNoise = generateWhiteNoise(grid, directionRandom);
  const filteredMagnitude = applySpectralFilter(magnitudeNoise, {
    cutoffPercent: parameters.scale,
    silenceCutoffPercent: parameters.silenceCutoffPercent,
    spectralSlopeDbPerOct: parameters.spectralSlopeDbPerOct,
  });
  const filteredDirection = applySpectralFilter(directionNoise, {
    cutoffPercent: parameters.scale,
    silenceCutoffPercent: parameters.silenceCutoffPercent,
    spectralSlopeDbPerOct: parameters.spectralSlopeDbPerOct,
  });

  const amplitude = shapeAmplitudeField(filteredMagnitude, parameters);
  const swirls = sampleSwirlCenters(
    {
      grid,
      density: parameters.swirlDensity,
      force: parameters.force,
      renderWidth: parameters.renderWidth,
      renderHeight: parameters.renderHeight,
      minimumAngleDegrees: parameters.swirlMinimumAngleDegrees,
      strengthPercent: parameters.swirlStrengthPercent,
      swirlFalloff: parameters.swirlFalloff,
      directionBias: parameters.swirlDirectionBias,
    },
    swirlRandom,
  );
  const swirlInfluence = evaluateSwirlInfluence(grid, swirls, parameters);

  const direction = new Float32Array(grid.width * grid.height);
  const displacementX = new Float32Array(grid.width * grid.height);
  const displacementY = new Float32Array(grid.width * grid.height);
  const magnitude = new Float32Array(grid.width * grid.height);

  for (let index = 0; index < direction.length; index += 1) {
    const noiseAngle = filteredDirection.values[index] * Math.PI * 2;
    const noiseDisplacementX =
      Math.cos(noiseAngle) * amplitude[index] * parameters.force;
    const noiseDisplacementY =
      Math.sin(noiseAngle) * amplitude[index] * parameters.force;
    const swirlDisplacementX =
      swirlInfluence.vectorX[index] * parameters.renderWidth;
    const swirlDisplacementY =
      swirlInfluence.vectorY[index] * parameters.renderHeight;
    const noiseGain =
      parameters.directionNoiseMix +
      (1 - parameters.directionNoiseMix) * swirlInfluence.noiseGain[index];
    const composedVector = {
      x: swirlDisplacementX + noiseDisplacementX * noiseGain,
      y: swirlDisplacementY + noiseDisplacementY * noiseGain,
    };

    direction[index] = Math.atan2(composedVector.y, composedVector.x);
    displacementX[index] = composedVector.x;
    displacementY[index] = composedVector.y;
    magnitude[index] = Math.hypot(displacementX[index], displacementY[index]);
  }

  return {
    grid,
    amplitude,
    direction,
    displacementX,
    displacementY,
    magnitude,
    maximumDisplacementMagnitude: parameters.force,
    swirls,
  };
}

export function generateDefaultVectorField(): VectorField {
  return generateVectorField(DEFAULT_PARAMETERS, DEFAULT_GRID);
}
