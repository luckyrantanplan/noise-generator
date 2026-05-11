import type { GridSpec } from "../shared/types.js";

export const DEFAULT_GRID: GridSpec = {
  width: 64,
  height: 64,
};

export function createGrid(width: number, height: number): GridSpec {
  assertPowerOfTwo(width, "width");
  assertPowerOfTwo(height, "height");
  return { width, height };
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

function assertPowerOfTwo(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 4 || (value & (value - 1)) !== 0) {
    throw new Error(
      `${name} must be a power of two greater than or equal to 4`,
    );
  }
}
