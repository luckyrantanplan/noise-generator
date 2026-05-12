import WebFFT from "webfft";

import type { GridSpec, ScalarField } from "../shared/types.js";
import type { SeededRandom } from "./rng.js";

interface SpectralOptions {
  cutoffPercent: number;
  spectralSlopeDbPerOct: number;
}

type ComplexRows = Float32Array[];

const DB_PER_OCTAVE_FOR_UNIT_POWER_SLOPE = 10 * Math.log10(2);

export function generateWhiteNoise(
  grid: GridSpec,
  random: SeededRandom,
): ScalarField {
  const values = new Float32Array(grid.width * grid.height);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = random.between(-1, 1);
  }
  return { grid, values };
}

export function applySpectralFilter(
  field: ScalarField,
  options: SpectralOptions,
): ScalarField {
  const transformGrid = createTransformGrid(field.grid);
  const paddedField = tileFieldToGrid(field, transformGrid);
  const complexRows = scalarToComplexRows(paddedField);
  const frequencyRows = forwardTransform2d(complexRows, transformGrid);
  applyEnvelope(frequencyRows, transformGrid, field.grid, options);
  const spatialRows = inverseTransform2d(frequencyRows, transformGrid);
  const croppedRows = cropComplexRows(spatialRows, field.grid);
  return normalizeComplexRowsToScalar(croppedRows, field.grid);
}

function scalarToComplexRows(field: ScalarField): ComplexRows {
  const rows: ComplexRows = [];
  for (let rowIndex = 0; rowIndex < field.grid.height; rowIndex += 1) {
    const row = new Float32Array(field.grid.width * 2);
    for (
      let columnIndex = 0;
      columnIndex < field.grid.width;
      columnIndex += 1
    ) {
      const scalarIndex = rowIndex * field.grid.width + columnIndex;
      row[columnIndex * 2] = field.values[scalarIndex];
      row[columnIndex * 2 + 1] = 0;
    }
    rows.push(row);
  }
  return rows;
}

function forwardTransform2d(rows: ComplexRows, grid: GridSpec): ComplexRows {
  const rowTransformed = transformRows(rows, grid.width);
  const columnTransformed = transformColumns(rowTransformed, grid);
  return columnTransformed;
}

function inverseTransform2d(rows: ComplexRows, grid: GridSpec): ComplexRows {
  const conjugatedRows = conjugateRows(rows);
  const transformedRows = forwardTransform2d(conjugatedRows, grid);
  const scale = grid.width * grid.height;

  for (const row of transformedRows) {
    for (let index = 0; index < row.length; index += 2) {
      row[index] = row[index] / scale;
      row[index + 1] = -row[index + 1] / scale;
    }
  }

  return transformedRows;
}

function transformRows(rows: ComplexRows, rowSize: number): ComplexRows {
  const transformer = new WebFFT(rowSize, "indutnyJavascript", false);
  try {
    return rows.map((row) => transformer.fft(row));
  } finally {
    transformer.dispose();
  }
}

function transformColumns(rows: ComplexRows, grid: GridSpec): ComplexRows {
  const outputRows = createEmptyComplexRows(grid);
  const transformer = new WebFFT(grid.height, "indutnyJavascript", false);

  try {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const column = new Float32Array(grid.height * 2);
      for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
        column[rowIndex * 2] = rows[rowIndex][columnIndex * 2];
        column[rowIndex * 2 + 1] = rows[rowIndex][columnIndex * 2 + 1];
      }

      const transformedColumn = transformer.fft(column);
      for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
        outputRows[rowIndex][columnIndex * 2] = transformedColumn[rowIndex * 2];
        outputRows[rowIndex][columnIndex * 2 + 1] =
          transformedColumn[rowIndex * 2 + 1];
      }
    }
  } finally {
    transformer.dispose();
  }

  return outputRows;
}

function applyEnvelope(
  rows: ComplexRows,
  transformGrid: GridSpec,
  sourceGrid: GridSpec,
  options: SpectralOptions,
): void {
  for (let rowIndex = 0; rowIndex < transformGrid.height; rowIndex += 1) {
    const frequencyY = signedFrequency(rowIndex, transformGrid.height);
    for (let columnIndex = 0; columnIndex < transformGrid.width; columnIndex += 1) {
      const frequencyX = signedFrequency(columnIndex, transformGrid.width);
      const radius = Math.hypot(frequencyX, frequencyY);
      const envelope = spectralEnvelope(radius, sourceGrid, options);
      const complexIndex = columnIndex * 2;
      rows[rowIndex][complexIndex] *= envelope;
      rows[rowIndex][complexIndex + 1] *= envelope;
    }
  }
}

function spectralEnvelope(
  radius: number,
  grid: GridSpec,
  options: SpectralOptions,
): number {
  if (radius === 0) {
    return 0;
  }

  const longestSide = Math.max(grid.width, grid.height);
  const cornerFrequency = Math.max(1, (options.cutoffPercent / 100) * longestSide);
  const normalizedRadius = radius / cornerFrequency;
  const powerSlope =
    options.spectralSlopeDbPerOct / DB_PER_OCTAVE_FOR_UNIT_POWER_SLOPE;

  return Math.pow(1 + normalizedRadius * normalizedRadius, -powerSlope / 4);
}

function normalizeComplexRowsToScalar(
  rows: ComplexRows,
  grid: GridSpec,
): ScalarField {
  const values = new Float32Array(grid.width * grid.height);
  let minimumValue = Number.POSITIVE_INFINITY;
  let maximumValue = Number.NEGATIVE_INFINITY;

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const scalarValue = rows[rowIndex][columnIndex * 2];
      const scalarIndex = rowIndex * grid.width + columnIndex;
      values[scalarIndex] = scalarValue;
      minimumValue = Math.min(minimumValue, scalarValue);
      maximumValue = Math.max(maximumValue, scalarValue);
    }
  }

  const range = maximumValue - minimumValue;
  if (range <= Number.EPSILON) {
    values.fill(0.5);
    return { grid, values };
  }

  for (let index = 0; index < values.length; index += 1) {
    values[index] = (values[index] - minimumValue) / range;
  }

  return { grid, values };
}

function createEmptyComplexRows(grid: GridSpec): ComplexRows {
  const rows: ComplexRows = [];
  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    rows.push(new Float32Array(grid.width * 2));
  }
  return rows;
}

function createTransformGrid(grid: GridSpec): GridSpec {
  return {
    width: nextPowerOfTwo(grid.width),
    height: nextPowerOfTwo(grid.height),
  };
}

function tileFieldToGrid(field: ScalarField, targetGrid: GridSpec): ScalarField {
  const values = new Float32Array(targetGrid.width * targetGrid.height);

  for (let rowIndex = 0; rowIndex < targetGrid.height; rowIndex += 1) {
    const sourceRow = rowIndex % field.grid.height;
    for (let columnIndex = 0; columnIndex < targetGrid.width; columnIndex += 1) {
      const sourceColumn = columnIndex % field.grid.width;
      const targetIndex = rowIndex * targetGrid.width + columnIndex;
      const sourceIndex = sourceRow * field.grid.width + sourceColumn;
      values[targetIndex] = field.values[sourceIndex];
    }
  }

  return { grid: targetGrid, values };
}

function cropComplexRows(rows: ComplexRows, targetGrid: GridSpec): ComplexRows {
  const croppedRows: ComplexRows = [];

  for (let rowIndex = 0; rowIndex < targetGrid.height; rowIndex += 1) {
    const croppedRow = new Float32Array(targetGrid.width * 2);
    for (let columnIndex = 0; columnIndex < targetGrid.width; columnIndex += 1) {
      croppedRow[columnIndex * 2] = rows[rowIndex][columnIndex * 2];
      croppedRow[columnIndex * 2 + 1] = rows[rowIndex][columnIndex * 2 + 1];
    }
    croppedRows.push(croppedRow);
  }

  return croppedRows;
}

function conjugateRows(rows: ComplexRows): ComplexRows {
  return rows.map((row) => {
    const conjugatedRow = new Float32Array(row.length);
    for (let index = 0; index < row.length; index += 2) {
      conjugatedRow[index] = row[index];
      conjugatedRow[index + 1] = -row[index + 1];
    }
    return conjugatedRow;
  });
}

function signedFrequency(index: number, size: number): number {
  if (index <= size / 2) {
    return index;
  }
  return index - size;
}

function nextPowerOfTwo(value: number): number {
  let power = 4;
  while (power < value) {
    power *= 2;
  }
  return power;
}
