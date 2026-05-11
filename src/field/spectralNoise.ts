import WebFFT from "webfft";

import type { GridSpec, ScalarField } from "../shared/types.js";
import type { SeededRandom } from "./rng.js";

interface SpectralOptions {
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
}

type ComplexRows = Float32Array[];

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
  const complexRows = scalarToComplexRows(field);
  const frequencyRows = forwardTransform2d(complexRows, field.grid);
  applyEnvelope(frequencyRows, field.grid, options);
  const spatialRows = inverseTransform2d(frequencyRows, field.grid);
  return normalizeComplexRowsToScalar(spatialRows, field.grid);
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
  grid: GridSpec,
  options: SpectralOptions,
): void {
  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const frequencyY = signedFrequency(rowIndex, grid.height);
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const frequencyX = signedFrequency(columnIndex, grid.width);
      const radius = Math.hypot(frequencyX, frequencyY);
      const envelope = spectralEnvelope(radius, grid, options);
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
  const baseCutoff = Math.max(1, longestSide / options.scale);
  let envelope = 0;
  let amplitude = 1;
  let cutoff = baseCutoff;

  for (let octaveIndex = 0; octaveIndex < options.octaves; octaveIndex += 1) {
    const normalizedRadius = radius / cutoff;
    envelope += amplitude * Math.exp(-normalizedRadius * normalizedRadius);
    amplitude *= options.persistence;
    cutoff *= options.lacunarity;
  }

  return envelope;
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
