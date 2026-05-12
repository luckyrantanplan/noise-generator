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
    const noiseVectorX = Math.cos(noiseAngle);
    const noiseVectorY = Math.sin(noiseAngle);
    const swirlWeight = Math.min(1, swirlInfluence.weight[index]);
    const mixNoise = parameters.directionNoiseMix;
    const mixSwirl = (1 - mixNoise) * swirlWeight;
    const swirlLength = Math.hypot(
      swirlInfluence.vectorX[index],
      swirlInfluence.vectorY[index],
    );
    const swirlVectorX =
      swirlLength > Number.EPSILON
        ? swirlInfluence.vectorX[index] / swirlLength
        : noiseVectorX;
    const swirlVectorY =
      swirlLength > Number.EPSILON
        ? swirlInfluence.vectorY[index] / swirlLength
        : noiseVectorY;
    const combinedX = noiseVectorX * mixNoise + swirlVectorX * mixSwirl;
    const combinedY = noiseVectorY * mixNoise + swirlVectorY * mixSwirl;
    const combinedLength = Math.hypot(combinedX, combinedY);
    const unitX =
      combinedLength > Number.EPSILON
        ? combinedX / combinedLength
        : noiseVectorX;
    const unitY =
      combinedLength > Number.EPSILON
        ? combinedY / combinedLength
        : noiseVectorY;

    direction[index] = Math.atan2(unitY, unitX);
    displacementX[index] = unitX * amplitude[index] * parameters.force;
    displacementY[index] = unitY * amplitude[index] * parameters.force;
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
