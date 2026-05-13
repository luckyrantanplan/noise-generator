import { DEFAULT_PARAMETERS } from "../shared/params.js";
import type {
  GridSpec,
  ParameterValues,
  VectorField,
} from "../shared/types.js";
import { shapeAmplitudeField } from "./amplitude.js";
import { DEFAULT_GRID, createGrid } from "./grid.js";
import { sampleSwirlCenters } from "./poissonDisk.js";
import { SeededRandom } from "./hashSeed.js";
import { generateWhiteNoise, applySpectralFilter } from "./spectralNoise.js";
import { evaluateSwirlInfluence } from "./swirls.js";

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
    spectralSlopeDbPerOct: parameters.spectralSlopeDbPerOct,
  });
  const filteredDirection = applySpectralFilter(directionNoise, {
    cutoffPercent: parameters.scale,
    spectralSlopeDbPerOct: parameters.spectralSlopeDbPerOct,
  });

  const amplitude = shapeAmplitudeField(filteredMagnitude, parameters);
  const swirls = sampleSwirlCenters(
    {
      grid,
      density: parameters.swirlDensity,
      radius: parameters.swirlRadius / 100,
      strength: parameters.swirlStrength,
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
    const noiseMix = parameters.directionNoiseMix;
    const swirlMix = 1 - noiseMix;
    const hasSwirlInfluence = swirlInfluence.weight[index] > 1e-6 ? 1 : 0;
    const localNoiseMix = 1 - hasSwirlInfluence * swirlMix;
    const combinedX =
      noiseDisplacementX * localNoiseMix + swirlDisplacementX * swirlMix;
    const combinedY =
      noiseDisplacementY * localNoiseMix + swirlDisplacementY * swirlMix;

    direction[index] = Math.atan2(combinedY, combinedX);
    displacementX[index] = combinedX;
    displacementY[index] = combinedY;
    magnitude[index] = Math.hypot(displacementX[index], displacementY[index]);
  }

  return {
    grid,
    amplitude,
    direction,
    displacementX,
    displacementY,
    magnitude,
    swirls,
  };
}

export function generateDefaultVectorField(): VectorField {
  return generateVectorField(DEFAULT_PARAMETERS, DEFAULT_GRID);
}
