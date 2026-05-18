import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_GRID, createGridFromSparseness } from "../src/field/grid.js";
import { SeededRandom } from "../src/field/hashSeed.js";
import { traceIsolineFromPoint } from "../src/field/isolineTracing.js";
import { estimateGradient, sampleScalar } from "../src/field/scalarSampling.js";
import {
  generateDisplacementField,
  generateVectorField,
} from "../src/field/composeField.js";
import {
  frequencyRadiusInLongestSideUnits,
  generateWhiteNoise,
  applySpectralFilter,
} from "../src/field/spectralNoise.js";
import {
  DEFAULT_PARAMETERS,
  MAX_CUTOFF_PERCENT,
  MAX_SILENCE_CUTOFF_PERCENT,
  MIN_CUTOFF_PERCENT,
  MIN_SILENCE_CUTOFF_PERCENT,
} from "../src/shared/params.js";
import {
  parseParameters,
  validateParameters,
} from "../src/server/parameterValidation.js";
import type { ParameterValues, ScalarField } from "../src/shared/types.js";

void test("seeded random values are reproducible", () => {
  const firstRandom = new SeededRandom("same-seed");
  const secondRandom = new SeededRandom("same-seed");

  const firstSequence = [
    firstRandom.next(),
    firstRandom.next(),
    firstRandom.next(),
  ];
  const secondSequence = [
    secondRandom.next(),
    secondRandom.next(),
    secondRandom.next(),
  ];

  assert.deepEqual(firstSequence, secondSequence);
});

void test("scalar sampling uses bilinear interpolation", () => {
  const field: ScalarField = {
    grid: { width: 2, height: 2 },
    values: new Float32Array([0, 1, 0, 1]),
  };

  assert.ok(Math.abs(sampleScalar(field, 0.5, 0.5) - 0.5) < 1e-6);
});

void test("gradient estimation follows a linear scalar field", () => {
  const field = createLinearScalarField(
    (pointX, pointY) => pointX + pointY * 2,
  );
  const gradient = estimateGradient(field, 0.5, 0.5);

  assert.ok(Math.abs(gradient.x - 1) < 0.15);
  assert.ok(Math.abs(gradient.y - 2) < 0.15);
});

void test("tracing follows the high-value-left convention and truncates at maxTraceLength", () => {
  const field = createLinearScalarField((_, pointY) => pointY);
  const trace = traceIsolineFromPoint(
    field,
    { x: 2, y: 2 },
    {
      renderWidth: 4,
      renderHeight: 4,
      targetTurnAngleDegrees: 720,
      maxTraceLength: 1.5,
    },
  );

  assert.equal(trace.terminationReason, "length-limit");
  assert.ok(Math.abs(measurePathLength(trace.path) - 1.5) < 1e-4);
  const endPoint = trace.path[trace.path.length - 1];
  assert.ok(Math.abs(endPoint.x - 0.5) < 1e-4);
  assert.ok(Math.abs(endPoint.y - 2) < 1e-4);
});

void test("within-cell cubic marching is closer to a curved contour than the legacy chord step", () => {
  const renderWidth = 4;
  const renderHeight = 4;
  const contourBaseY = 2.2;
  const contourOriginX = 2;
  const contourCurvature = 0.25;
  const field = createWorldScalarField({
    gridWidth: 5,
    gridHeight: 5,
    renderWidth,
    renderHeight,
    sampler: (pointX, pointY) => {
      return (
        pointY -
        (contourBaseY + contourCurvature * (pointX - contourOriginX) ** 2)
      );
    },
  });
  const startPoint = {
    x: contourOriginX,
    y: contourBaseY,
  };
  const trace = traceIsolineFromPoint(field, startPoint, {
    renderWidth,
    renderHeight,
    targetTurnAngleDegrees: 180,
    maxTraceLength: 10,
    maxSteps: 1,
  });
  const refinedLength = measurePathLength(trace.path);
  const endPoint = trace.path[trace.path.length - 1];
  const legacyChordLength = Math.hypot(
    endPoint.x - startPoint.x,
    endPoint.y - startPoint.y,
  );
  const expectedArcLength = measureParabolaArcLength(
    contourCurvature,
    contourOriginX,
    startPoint.x,
    endPoint.x,
  );
  const refinedError = Math.abs(refinedLength - expectedArcLength);
  const chordError = Math.abs(legacyChordLength - expectedArcLength);

  assert.ok(trace.path.length > 2);
  assert.ok(Math.abs(endPoint.x - 1) < 1e-3);
  assert.ok(Math.abs(endPoint.y - 2.45) < 5e-3);
  assert.ok(refinedError < chordError * 0.2);
});

void test("maxTraceLength changes the generated field for a fixed seed", () => {
  const shortTraceField = generateDisplacementField({
    ...DEFAULT_PARAMETERS,
    renderWidth: 9,
    renderHeight: 9,
    gridSparseness: 1,
    maxTraceLength: 5,
    randomSeed: "trace-length",
  });
  const longTraceField = generateDisplacementField({
    ...DEFAULT_PARAMETERS,
    renderWidth: 9,
    renderHeight: 9,
    gridSparseness: 1,
    maxTraceLength: 15,
    randomSeed: "trace-length",
  });

  assert.ok(fieldsDiffer(shortTraceField, longTraceField));
});

void test("targetTurnAngleDegrees changes the generated field for a fixed seed", () => {
  const tightTurnField = generateDisplacementField({
    ...DEFAULT_PARAMETERS,
    renderWidth: 9,
    renderHeight: 9,
    gridSparseness: 1,
    targetTurnAngleDegrees: 45,
    randomSeed: "turn-angle",
  });
  const wideTurnField = generateDisplacementField({
    ...DEFAULT_PARAMETERS,
    renderWidth: 9,
    renderHeight: 9,
    gridSparseness: 1,
    targetTurnAngleDegrees: 270,
    randomSeed: "turn-angle",
  });

  assert.ok(fieldsDiffer(tightTurnField, wideTurnField));
});

void test("generated field magnitudes stay within maxTraceLength", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    maxTraceLength: 40,
    targetTurnAngleDegrees: 180,
    randomSeed: "trace-cap-field",
  };
  const generatedField = generateVectorField(parameters, {
    width: 33,
    height: 25,
  });

  assert.equal(
    generatedField.maximumDisplacementMagnitude,
    parameters.maxTraceLength,
  );

  for (const value of generatedField.magnitude) {
    assert.ok(value <= parameters.maxTraceLength + 1e-5);
  }
});

void test("generated field magnitudes match final displacement components", () => {
  const generatedField = generateVectorField(
    {
      ...DEFAULT_PARAMETERS,
      maxTraceLength: 55,
      targetTurnAngleDegrees: 120,
      randomSeed: "final-displacement-fidelity",
    },
    {
      width: 29,
      height: 21,
    },
  );

  for (let index = 0; index < generatedField.magnitude.length; index += 1) {
    const expectedMagnitude = Math.hypot(
      generatedField.displacementX[index],
      generatedField.displacementY[index],
    );
    assert.ok(
      Math.abs(generatedField.magnitude[index] - expectedMagnitude) < 1e-5,
    );
  }
});

void test("generateDisplacementField matches explicit grid generation", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    renderWidth: 640,
    renderHeight: 480,
    gridSparseness: 20,
    randomSeed: "wrapper-parity",
  };
  const explicitGrid = createGridFromSparseness(
    parameters.renderWidth,
    parameters.renderHeight,
    parameters.gridSparseness,
  );
  const explicitField = generateVectorField(parameters, explicitGrid);
  const wrappedField = generateDisplacementField(parameters);

  assert.deepEqual(wrappedField.grid, explicitField.grid);
  assert.deepEqual(
    Array.from(wrappedField.direction),
    Array.from(explicitField.direction),
  );
  assert.deepEqual(
    Array.from(wrappedField.displacementX),
    Array.from(explicitField.displacementX),
  );
  assert.deepEqual(
    Array.from(wrappedField.displacementY),
    Array.from(explicitField.displacementY),
  );
  assert.deepEqual(
    Array.from(wrappedField.magnitude),
    Array.from(explicitField.magnitude),
  );
});

void test("parameter parsing preserves valid numeric values exactly", () => {
  const parameters = createParameterObject({
    renderWidth: 99999,
    renderHeight: 9,
    maxTraceLength: 99999,
    targetTurnAngleDegrees: 810,
    scale: 999,
    silenceCutoffPercent: 123,
    gridSparseness: 2,
    spectralSlopeDbPerOct: 999,
    showHeatmap: false,
    vectorOverlayDensity: 999,
    randomSeed: "  tuned-seed  ",
  });

  const parsedParameters = parseParameters(parameters);

  assert.equal(parsedParameters.renderWidth, 99999);
  assert.equal(parsedParameters.renderHeight, 9);
  assert.equal(parsedParameters.maxTraceLength, 99999);
  assert.equal(parsedParameters.targetTurnAngleDegrees, 810);
  assert.equal(parsedParameters.scale, 999);
  assert.equal(parsedParameters.silenceCutoffPercent, 123);
  assert.equal(parsedParameters.gridSparseness, 2);
  assert.equal(parsedParameters.spectralSlopeDbPerOct, 999);
  assert.equal(parsedParameters.showHeatmap, false);
  assert.equal(parsedParameters.vectorOverlayDensity, 999);
  assert.equal(parsedParameters.randomSeed, "  tuned-seed  ");
});

void test("parameter parsing requires every parameter", () => {
  assert.throws(() => {
    parseParameters({
      renderWidth: "640",
    });
  }, /Missing required parameter: renderHeight/);
});

void test("parameter parsing rejects non-computable numeric values", () => {
  assert.throws(() => {
    parseParameters(createParameterObject({ renderHeight: 0 }));
  }, /Invalid parameter renderHeight: must be >= 1/);

  assert.throws(() => {
    parseParameters(createParameterObject({ gridSparseness: 0 }));
  }, /Invalid parameter gridSparseness: must be >= 1/);

  assert.throws(() => {
    parseParameters(createParameterObject({ targetTurnAngleDegrees: -1 }));
  }, /Invalid parameter targetTurnAngleDegrees: must be >= 0/);

  assert.throws(() => {
    parseParameters(createParameterObject({ showHeatmap: "maybe" }));
  }, /Invalid parameter showHeatmap: must be boolean/);
});

void test("schema validation rejects null parameter values", () => {
  assert.throws(() => {
    validateParameters({
      ...DEFAULT_PARAMETERS,
      renderWidth: null,
    });
  }, /Invalid parameter renderWidth: must be integer/);
});

void test("spectral radius stays isotropic on rectangular grids", () => {
  const grid = { width: 96, height: 48 };
  const horizontalRadius = frequencyRadiusInLongestSideUnits(2, 0, grid);
  const verticalRadius = frequencyRadiusInLongestSideUnits(0, 1, grid);

  assert.ok(Math.abs(horizontalRadius - verticalRadius) < 1e-9);
});

void test("spectral filtering normalizes noise into unit range", () => {
  const random = new SeededRandom("spectral");
  const noise = generateWhiteNoise({ width: 8, height: 8 }, random);
  const filtered = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
    silenceCutoffPercent: DEFAULT_PARAMETERS.silenceCutoffPercent,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });

  for (const value of filtered.values) {
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
});

void test("spectral filtering supports non-power-of-two grids", () => {
  const random = new SeededRandom("non-power-of-two");
  const noise = generateWhiteNoise({ width: 96, height: 72 }, random);
  const filtered = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
    silenceCutoffPercent: DEFAULT_PARAMETERS.silenceCutoffPercent,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });

  assert.equal(filtered.grid.width, 96);
  assert.equal(filtered.grid.height, 72);
  for (const value of filtered.values) {
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
});

void test("higher spectral slope smooths the filtered field", () => {
  const random = new SeededRandom("slope-comparison");
  const noise = generateWhiteNoise({ width: 32, height: 32 }, random);
  const lowSlope = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
    silenceCutoffPercent: DEFAULT_PARAMETERS.silenceCutoffPercent,
    spectralSlopeDbPerOct: 0,
  });
  const highSlope = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
    silenceCutoffPercent: DEFAULT_PARAMETERS.silenceCutoffPercent,
    spectralSlopeDbPerOct: 9,
  });

  assert.ok(measureFieldRoughness(highSlope) < measureFieldRoughness(lowSlope));
});

void test("higher cutoff percent preserves finer spatial variation", () => {
  const random = new SeededRandom("cutoff-comparison");
  const noise = generateWhiteNoise({ width: 32, height: 32 }, random);
  const lowCutoff = applySpectralFilter(noise, {
    cutoffPercent: MIN_CUTOFF_PERCENT,
    silenceCutoffPercent: MAX_SILENCE_CUTOFF_PERCENT,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });
  const highCutoff = applySpectralFilter(noise, {
    cutoffPercent: MAX_CUTOFF_PERCENT,
    silenceCutoffPercent: MAX_SILENCE_CUTOFF_PERCENT,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });

  assert.ok(
    measureFieldRoughness(highCutoff) > measureFieldRoughness(lowCutoff),
  );
});

void test("silence cutoff removes all non-DC frequency content beyond the threshold", () => {
  const random = new SeededRandom("silence-cutoff");
  const noise = generateWhiteNoise({ width: 32, height: 32 }, random);
  const silenced = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
    silenceCutoffPercent: MIN_SILENCE_CUTOFF_PERCENT,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });

  for (const value of silenced.values) {
    assert.ok(Math.abs(value - 0.5) < 1e-6);
  }
});

void test("grid sparseness maps SVG units to grid dimensions", () => {
  const denseGrid = createGridFromSparseness(960, 720, 1);
  const sparseGrid = createGridFromSparseness(960, 720, 10);

  assert.deepEqual(denseGrid, { width: 960, height: 720 });
  assert.deepEqual(sparseGrid, { width: 96, height: 72 });
});

void test("default grid is power-of-two sized for FFT processing", () => {
  assert.equal(DEFAULT_GRID.width, 64);
  assert.equal(DEFAULT_GRID.height, 64);
});

function createLinearScalarField(
  sampler: (pointX: number, pointY: number) => number,
): ScalarField {
  const grid = { width: 5, height: 5 };
  const values = new Float32Array(grid.width * grid.height);

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const index = rowIndex * grid.width + columnIndex;
      const pointX = columnIndex / (grid.width - 1);
      const pointY = rowIndex / (grid.height - 1);
      values[index] = sampler(pointX, pointY);
    }
  }

  return { grid, values };
}

function createWorldScalarField(options: {
  gridWidth: number;
  gridHeight: number;
  renderWidth: number;
  renderHeight: number;
  sampler: (pointX: number, pointY: number) => number;
}): ScalarField {
  const values = new Float32Array(options.gridWidth * options.gridHeight);

  for (let rowIndex = 0; rowIndex < options.gridHeight; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < options.gridWidth;
      columnIndex += 1
    ) {
      const index = rowIndex * options.gridWidth + columnIndex;
      const pointX =
        (columnIndex / (options.gridWidth - 1)) * options.renderWidth;
      const pointY =
        (rowIndex / (options.gridHeight - 1)) * options.renderHeight;
      values[index] = options.sampler(pointX, pointY);
    }
  }

  return {
    grid: { width: options.gridWidth, height: options.gridHeight },
    values,
  };
}

function fieldsDiffer(
  left: ReturnType<typeof generateDisplacementField>,
  right: ReturnType<typeof generateDisplacementField>,
): boolean {
  for (let index = 0; index < left.displacementX.length; index += 1) {
    if (
      Math.abs(left.displacementX[index] - right.displacementX[index]) > 1e-6 ||
      Math.abs(left.displacementY[index] - right.displacementY[index]) > 1e-6
    ) {
      return true;
    }
  }

  return false;
}

function measurePathLength(path: { x: number; y: number }[]): number {
  let length = 0;

  for (let index = 1; index < path.length; index += 1) {
    length += Math.hypot(
      path[index].x - path[index - 1].x,
      path[index].y - path[index - 1].y,
    );
  }

  return length;
}

function measureParabolaArcLength(
  curvature: number,
  originX: number,
  startX: number,
  endX: number,
): number {
  const antiderivative = (pointX: number): number => {
    const scaledSlope = 2 * curvature * (pointX - originX);
    return (
      (scaledSlope * Math.sqrt(1 + scaledSlope * scaledSlope) +
        Math.asinh(scaledSlope)) /
      (4 * curvature)
    );
  };

  return Math.abs(antiderivative(endX) - antiderivative(startX));
}

function measureFieldRoughness(field: ScalarField): number {
  let differenceTotal = 0;
  let comparisonCount = 0;

  for (let rowIndex = 0; rowIndex < field.grid.height; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < field.grid.width;
      columnIndex += 1
    ) {
      const index = rowIndex * field.grid.width + columnIndex;
      if (columnIndex + 1 < field.grid.width) {
        differenceTotal += Math.abs(
          field.values[index] - field.values[index + 1],
        );
        comparisonCount += 1;
      }
      if (rowIndex + 1 < field.grid.height) {
        differenceTotal += Math.abs(
          field.values[index] - field.values[index + field.grid.width],
        );
        comparisonCount += 1;
      }
    }
  }

  return comparisonCount === 0 ? 0 : differenceTotal / comparisonCount;
}

function createParameterObject(
  overrides: Partial<ParameterValues> | Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...DEFAULT_PARAMETERS,
    ...overrides,
  };
}
