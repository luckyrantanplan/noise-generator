import { DEFAULT_PARAMETERS, normalizeParameters } from "../shared/params.js";
import {
  MATERIAL_PRESENCE_RATIO,
  SOFT_SWIRL_SHARE,
} from "../shared/swirlBudget.js";
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
  const normalizedParameters = normalizeParameters(parameters);
  const grid = createGridFromSparseness(
    normalizedParameters.renderWidth,
    normalizedParameters.renderHeight,
    normalizedParameters.gridSparseness,
  );

  return generateVectorField(normalizedParameters, grid);
}

export function generateVectorField(
  parameters: ParameterValues,
  suppliedGrid: GridSpec,
): VectorField {
  const normalizedParameters = normalizeParameters(parameters);
  const grid = createGrid(suppliedGrid.width, suppliedGrid.height);
  const magnitudeRandom = new SeededRandom(
    `${normalizedParameters.randomSeed}:magnitude`,
  );
  const directionRandom = new SeededRandom(
    `${normalizedParameters.randomSeed}:direction`,
  );
  const swirlRandom = new SeededRandom(
    `${normalizedParameters.randomSeed}:swirls`,
  );

  const magnitudeNoise = generateWhiteNoise(grid, magnitudeRandom);
  const directionNoise = generateWhiteNoise(grid, directionRandom);
  const filteredMagnitude = applySpectralFilter(magnitudeNoise, {
    cutoffPercent: normalizedParameters.scale,
    spectralSlopeDbPerOct: normalizedParameters.spectralSlopeDbPerOct,
  });
  const filteredDirection = applySpectralFilter(directionNoise, {
    cutoffPercent: normalizedParameters.scale,
    spectralSlopeDbPerOct: normalizedParameters.spectralSlopeDbPerOct,
  });

  const amplitude = shapeAmplitudeField(
    filteredMagnitude,
    normalizedParameters,
  );
  const swirls = sampleSwirlCenters(
    {
      grid,
      density: normalizedParameters.swirlDensity,
      force: normalizedParameters.force,
      renderWidth: normalizedParameters.renderWidth,
      renderHeight: normalizedParameters.renderHeight,
      minimumAngleDegrees: normalizedParameters.swirlMinimumAngleDegrees,
      strengthPercent: normalizedParameters.swirlStrengthPercent,
      swirlFalloff: normalizedParameters.swirlFalloff,
      directionBias: normalizedParameters.swirlDirectionBias,
    },
    swirlRandom,
  );
  const swirlInfluence = evaluateSwirlInfluence(
    grid,
    swirls,
    normalizedParameters,
  );

  const direction = new Float32Array(grid.width * grid.height);
  const displacementX = new Float32Array(grid.width * grid.height);
  const displacementY = new Float32Array(grid.width * grid.height);
  const magnitude = new Float32Array(grid.width * grid.height);

  for (let index = 0; index < direction.length; index += 1) {
    const noiseAngle = filteredDirection.values[index] * Math.PI * 2;
    const noiseDisplacementX =
      Math.cos(noiseAngle) * amplitude[index] * normalizedParameters.force;
    const noiseDisplacementY =
      Math.sin(noiseAngle) * amplitude[index] * normalizedParameters.force;
    const swirlDisplacementX =
      swirlInfluence.vectorX[index] * normalizedParameters.renderWidth;
    const swirlDisplacementY =
      swirlInfluence.vectorY[index] * normalizedParameters.renderHeight;
    const noiseGain =
      normalizedParameters.directionNoiseMix +
      (1 - normalizedParameters.directionNoiseMix) *
        swirlInfluence.noiseGain[index];
    const composedVector = composeWithSharedBudget(
      swirlDisplacementX,
      swirlDisplacementY,
      noiseDisplacementX * noiseGain,
      noiseDisplacementY * noiseGain,
      normalizedParameters.force,
    );

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
    swirls,
  };
}

export function generateDefaultVectorField(): VectorField {
  return generateVectorField(DEFAULT_PARAMETERS, DEFAULT_GRID);
}

export function composeWithSharedBudget(
  swirlX: number,
  swirlY: number,
  noiseX: number,
  noiseY: number,
  force: number,
): { x: number; y: number } {
  if (force <= 1e-6) {
    return { x: 0, y: 0 };
  }

  const combinedX = swirlX + noiseX;
  const combinedY = swirlY + noiseY;
  const combinedMagnitude = Math.hypot(combinedX, combinedY);

  if (combinedMagnitude <= force + 1e-6) {
    return { x: combinedX, y: combinedY };
  }

  const swirlMagnitude = Math.hypot(swirlX, swirlY);
  const noiseMagnitude = Math.hypot(noiseX, noiseY);

  if (swirlMagnitude <= 1e-6) {
    return scaleVector(noiseX, noiseY, Math.min(noiseMagnitude, force));
  }

  if (noiseMagnitude <= 1e-6) {
    return scaleVector(swirlX, swirlY, Math.min(swirlMagnitude, force));
  }

  const materialThreshold = force * MATERIAL_PRESENCE_RATIO;
  let swirlBudget: number;
  let noiseBudget: number;

  if (Math.min(swirlMagnitude, noiseMagnitude) < materialThreshold) {
    if (swirlMagnitude <= noiseMagnitude) {
      swirlBudget = swirlMagnitude;
      noiseBudget = Math.min(noiseMagnitude, force - swirlBudget);
    } else {
      noiseBudget = noiseMagnitude;
      swirlBudget = Math.min(swirlMagnitude, force - noiseBudget);
    }
  } else {
    const requestedSwirlShare =
      swirlMagnitude / (swirlMagnitude + noiseMagnitude);
    const overload = clamp01((combinedMagnitude - force) / force);
    const swirlShare =
      requestedSwirlShare + (SOFT_SWIRL_SHARE - requestedSwirlShare) * overload;
    const noiseShare = 1 - swirlShare;

    swirlBudget = Math.min(swirlMagnitude, swirlShare * force);
    noiseBudget = Math.min(noiseMagnitude, noiseShare * force);
  }

  const scaledSwirl = scaleVector(swirlX, swirlY, swirlBudget);
  const scaledNoise = scaleVector(noiseX, noiseY, noiseBudget);

  return {
    x: scaledSwirl.x + scaledNoise.x,
    y: scaledSwirl.y + scaledNoise.y,
  };
}

function scaleVector(
  x: number,
  y: number,
  targetMagnitude: number,
): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);

  if (magnitude <= 1e-6 || targetMagnitude <= 0) {
    return { x: 0, y: 0 };
  }

  const scale = targetMagnitude / magnitude;
  return {
    x: x * scale,
    y: y * scale,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
