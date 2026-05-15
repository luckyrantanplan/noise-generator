import type {
  GridSpec,
  ParameterValues,
  SwirlCenter,
} from "../shared/types.js";
import { swirlAngleEnvelope, swirlNoiseGain } from "../shared/swirlBudget.js";
import {
  indexAt,
  normalizedCoordinate,
  shortSideMetricScales,
} from "./grid.js";

export interface SwirlInfluenceField {
  vectorX: Float32Array;
  vectorY: Float32Array;
  weight: Float32Array;
  noiseGain: Float32Array;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

export function evaluateSwirlInfluence(
  grid: GridSpec,
  swirls: SwirlCenter[],
  parameters: ParameterValues,
): SwirlInfluenceField {
  const metricScales = shortSideMetricScales(grid);
  const vectorX = new Float32Array(grid.width * grid.height);
  const vectorY = new Float32Array(grid.width * grid.height);
  const weight = new Float32Array(grid.width * grid.height);
  const noiseGain = new Float32Array(grid.width * grid.height);
  noiseGain.fill(1);

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const positionY = normalizedCoordinate(rowIndex, grid.height);
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const positionX = normalizedCoordinate(columnIndex, grid.width);
      const scalarIndex = indexAt(columnIndex, rowIndex, grid);
      accumulateSwirlsAtPoint(
        positionX,
        positionY,
        scalarIndex,
        swirls,
        parameters,
        metricScales,
        vectorX,
        vectorY,
        weight,
        noiseGain,
      );
    }
  }

  return { vectorX, vectorY, weight, noiseGain };
}

function accumulateSwirlsAtPoint(
  positionX: number,
  positionY: number,
  scalarIndex: number,
  swirls: SwirlCenter[],
  parameters: ParameterValues,
  metricScales: { xScale: number; yScale: number },
  vectorX: Float32Array,
  vectorY: Float32Array,
  weight: Float32Array,
  noiseGain: Float32Array,
): void {
  for (const swirl of swirls) {
    const physicalDeltaX = (positionX - swirl.positionX) * metricScales.xScale;
    const physicalDeltaY = (positionY - swirl.positionY) * metricScales.yScale;
    const distance = Math.hypot(physicalDeltaX, physicalDeltaY);
    if (distance <= Number.EPSILON || distance > swirl.radius) {
      continue;
    }

    const normalizedDistance = distance / swirl.radius;
    const angleEnvelope = swirlAngleEnvelope(
      normalizedDistance,
      parameters.swirlFalloff,
    );
    const localNoiseGain = swirlNoiseGain(normalizedDistance);
    noiseGain[scalarIndex] = Math.min(noiseGain[scalarIndex], localNoiseGain);
    if (angleEnvelope <= 1e-6) {
      continue;
    }

    const rotationAngle =
      swirl.direction *
      swirl.strengthDegrees *
      DEGREES_TO_RADIANS *
      angleEnvelope;
    const chord = rotateOffsetByAngle(
      physicalDeltaX,
      physicalDeltaY,
      rotationAngle,
    );

    vectorX[scalarIndex] += chord.x / metricScales.xScale;
    vectorY[scalarIndex] += chord.y / metricScales.yScale;
    weight[scalarIndex] += angleEnvelope;
  }
}

function rotateOffsetByAngle(
  offsetX: number,
  offsetY: number,
  angle: number,
): { x: number; y: number } {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotatedX = offsetX * cosine - offsetY * sine;
  const rotatedY = offsetX * sine + offsetY * cosine;

  return {
    x: rotatedX - offsetX,
    y: rotatedY - offsetY,
  };
}
