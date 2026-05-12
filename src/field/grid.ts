import type { GridSpec } from "../shared/types.js";

export const DEFAULT_GRID: GridSpec = {
  width: 64,
  height: 64,
};

export function createGrid(width: number, height: number): GridSpec {
  assertPositiveInteger(width, "width");
  assertPositiveInteger(height, "height");
  return { width, height };
}

export function createGridFromSparseness(
  renderWidth: number,
  renderHeight: number,
  gridSparseness: number,
): GridSpec {
  const width = Math.max(1, Math.round(renderWidth / gridSparseness));
  const height = Math.max(1, Math.round(renderHeight / gridSparseness));
  return createGrid(width, height);
}

export function indexAt(
  columnIndex: number,
  rowIndex: number,
  grid: GridSpec,
): number {
  return rowIndex * grid.width + columnIndex;
}

export function normalizedCoordinate(
  cellIndex: number,
  cellCount: number,
): number {
  if (cellCount <= 1) {
    return 0;
  }
  return cellIndex / (cellCount - 1);
}

export function shortSideMetricScales(
  grid: GridSpec,
): { xScale: number; yScale: number } {
  const shortestSide = Math.min(grid.width, grid.height);
  return {
    xScale: grid.width / shortestSide,
    yScale: grid.height / shortestSide,
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}
