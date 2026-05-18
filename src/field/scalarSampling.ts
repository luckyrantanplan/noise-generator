import type { GridSpec, ScalarField } from "../shared/types.js";
import { indexAt, normalizedCoordinate } from "./grid.js";

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface GridCellLocation {
  columnIndex: number;
  rowIndex: number;
  localX: number;
  localY: number;
}

export function gridStepSize(grid: GridSpec): { xStep: number; yStep: number } {
  return {
    xStep: grid.width > 1 ? 1 / (grid.width - 1) : 1,
    yStep: grid.height > 1 ? 1 / (grid.height - 1) : 1,
  };
}

export function sampleNodeValue(
  field: ScalarField,
  columnIndex: number,
  rowIndex: number,
): number {
  const boundedColumnIndex = clampIndex(columnIndex, field.grid.width);
  const boundedRowIndex = clampIndex(rowIndex, field.grid.height);
  return field.values[indexAt(boundedColumnIndex, boundedRowIndex, field.grid)];
}

export function normalizedPointForNode(
  grid: GridSpec,
  columnIndex: number,
  rowIndex: number,
): NormalizedPoint {
  return {
    x: normalizedCoordinate(columnIndex, grid.width),
    y: normalizedCoordinate(rowIndex, grid.height),
  };
}

export function locateCell(
  grid: GridSpec,
  pointX: number,
  pointY: number,
): GridCellLocation | null {
  if (grid.width < 2 || grid.height < 2) {
    return null;
  }

  const clampedX = clamp01(pointX);
  const clampedY = clamp01(pointY);
  const scaledX = clampedX * (grid.width - 1);
  const scaledY = clampedY * (grid.height - 1);
  const columnIndex = Math.min(grid.width - 2, Math.floor(scaledX));
  const rowIndex = Math.min(grid.height - 2, Math.floor(scaledY));

  return {
    columnIndex,
    rowIndex,
    localX: scaledX - columnIndex,
    localY: scaledY - rowIndex,
  };
}

export function sampleScalar(
  field: ScalarField,
  pointX: number,
  pointY: number,
): number {
  if (field.grid.width === 1 || field.grid.height === 1) {
    return field.values[0];
  }

  const cell = locateCell(field.grid, pointX, pointY);
  if (cell === null) {
    return field.values[0];
  }

  const topLeft = sampleNodeValue(field, cell.columnIndex, cell.rowIndex);
  const topRight = sampleNodeValue(field, cell.columnIndex + 1, cell.rowIndex);
  const bottomLeft = sampleNodeValue(
    field,
    cell.columnIndex,
    cell.rowIndex + 1,
  );
  const bottomRight = sampleNodeValue(
    field,
    cell.columnIndex + 1,
    cell.rowIndex + 1,
  );

  const top = interpolateLinear(topLeft, topRight, cell.localX);
  const bottom = interpolateLinear(bottomLeft, bottomRight, cell.localX);
  return interpolateLinear(top, bottom, cell.localY);
}

export function estimateGradient(
  field: ScalarField,
  pointX: number,
  pointY: number,
): NormalizedPoint {
  const steps = gridStepSize(field.grid);
  const sampleStepX = Math.max(steps.xStep * 0.5, 1e-4);
  const sampleStepY = Math.max(steps.yStep * 0.5, 1e-4);

  const previousX = Math.max(0, pointX - sampleStepX);
  const nextX = Math.min(1, pointX + sampleStepX);
  const previousY = Math.max(0, pointY - sampleStepY);
  const nextY = Math.min(1, pointY + sampleStepY);

  const sampleLeft = sampleScalar(field, previousX, pointY);
  const sampleRight = sampleScalar(field, nextX, pointY);
  const sampleTop = sampleScalar(field, pointX, previousY);
  const sampleBottom = sampleScalar(field, pointX, nextY);

  const denominatorX = Math.max(nextX - previousX, 1e-8);
  const denominatorY = Math.max(nextY - previousY, 1e-8);

  return {
    x: (sampleRight - sampleLeft) / denominatorX,
    y: (sampleBottom - sampleTop) / denominatorY,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampIndex(value: number, size: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, size - 1));
}

function interpolateLinear(
  startValue: number,
  endValue: number,
  ratio: number,
): number {
  return startValue + (endValue - startValue) * ratio;
}
