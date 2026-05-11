import type {
  GridSpec,
  ParameterValues,
  SwirlCenter,
} from "../shared/types.js";
import { indexAt, normalizedCoordinate } from "./grid.js";

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
  vectorX: Float32Array,
  vectorY: Float32Array,
  weight: Float32Array,
): void {
  for (const swirl of swirls) {
    const deltaX = positionX - swirl.positionX;
    const deltaY = positionY - swirl.positionY;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= Number.EPSILON || distance > swirl.radius) {
      continue;
    }

    const normalizedDistance = distance / swirl.radius;
    const falloff = Math.pow(1 - normalizedDistance, parameters.swirlFalloff);
    const influence = falloff * parameters.swirlStrength;
    const tangentAngle =
      Math.atan2(deltaY, deltaX) +
      swirl.direction * (Math.PI / 2) +
      swirl.phase;

    vectorX[scalarIndex] += Math.cos(tangentAngle) * influence;
    vectorY[scalarIndex] += Math.sin(tangentAngle) * influence;
    weight[scalarIndex] += influence;
  }
}
