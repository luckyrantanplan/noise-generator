import type {
  GridSpec,
  ParameterValues,
  SwirlCenter,
} from "../shared/types.js";
import {
  indexAt,
  normalizedCoordinate,
  shortSideMetricScales,
} from "./grid.js";

export interface SwirlInfluenceField {
  vectorX: Float32Array;
  vectorY: Float32Array;
  weight: Float32Array;
}

export function evaluateSwirlInfluence(
  grid: GridSpec,
  swirls: SwirlCenter[],
  parameters: ParameterValues,
): SwirlInfluenceField {
  const metricScales = shortSideMetricScales(grid);
  const vectorX = new Float32Array(grid.width * grid.height);
  const vectorY = new Float32Array(grid.width * grid.height);
  const weight = new Float32Array(grid.width * grid.height);

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
      );
    }
  }

  return { vectorX, vectorY, weight };
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
): void {
  for (const swirl of swirls) {
    const physicalDeltaX = (positionX - swirl.positionX) * metricScales.xScale;
    const physicalDeltaY = (positionY - swirl.positionY) * metricScales.yScale;
    const distance = Math.hypot(physicalDeltaX, physicalDeltaY);
    if (distance <= Number.EPSILON || distance > swirl.radius) {
      continue;
    }

    const normalizedDistance = distance / swirl.radius;
    const falloff = Math.pow(1 - normalizedDistance, parameters.swirlFalloff);
    const influence = falloff * parameters.swirlStrength;
    const tangentAngle =
      Math.atan2(physicalDeltaY, physicalDeltaX) +
      swirl.direction * (Math.PI / 2);

    vectorX[scalarIndex] += Math.cos(tangentAngle) * influence;
    vectorY[scalarIndex] += Math.sin(tangentAngle) * influence;
    weight[scalarIndex] += influence;
  }
}
