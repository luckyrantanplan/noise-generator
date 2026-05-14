import test from "node:test";
import assert from "node:assert/strict";

import { shapeAmplitudeField } from "../src/field/amplitude.js";
import {
  DEFAULT_GRID,
  createGridFromSparseness,
  indexAt,
  shortSideMetricScales,
} from "../src/field/grid.js";
import {
  densityToPoissonRadius,
  sampleSwirlCenters,
} from "../src/field/poissonDisk.js";
import { SeededRandom } from "../src/field/hashSeed.js";
import {
  composeWithSharedBudget,
  generateDisplacementField,
  generateVectorField,
} from "../src/field/composeField.js";
import { evaluateSwirlInfluence } from "../src/field/swirls.js";
import {
  frequencyRadiusInLongestSideUnits,
  generateWhiteNoise,
  applySpectralFilter,
} from "../src/field/spectralNoise.js";
import {
  DEFAULT_PARAMETERS,
  MAX_CUTOFF_PERCENT,
  validateParameters,
  parseParameters,
  MIN_CUTOFF_PERCENT,
} from "../src/shared/params.js";
import {
  maxSwirlRadiusInWorldUnits,
  minSwirlRadiusInWorldUnits,
  resolveSwirlStrengthDegrees,
} from "../src/shared/swirlBudget.js";
import type { ScalarField } from "../src/shared/types.js";

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

void test("amplitude shaping remaps values into the configured range", () => {
  const field: ScalarField = {
    grid: { width: 2, height: 2 },
    values: new Float32Array([0, 0.25, 0.5, 1]),
  };
  const parameters = {
    ...DEFAULT_PARAMETERS,
    amplitudeContrast: 1,
  };

  const shapedValues = shapeAmplitudeField(field, parameters);

  assert.ok(Math.abs(shapedValues[0] - 0) < 1e-6);
  assert.ok(Math.abs(shapedValues[3] - 1) < 1e-6);
  assert.ok(shapedValues[1] > shapedValues[0]);
  assert.ok(shapedValues[2] < shapedValues[3]);
});

void test("poisson radius decreases as requested swirl density increases", () => {
  const sparseRadius = densityToPoissonRadius(8);
  const denseRadius = densityToPoissonRadius(40);

  assert.ok(denseRadius < sparseRadius);
});

void test("poisson sampler returns force-derived radii across a range", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    renderWidth: 960,
    renderHeight: 720,
    force: 80,
    swirlDensity: 24,
    swirlMinimumAngleDegrees: 180,
    swirlStrengthPercent: 60,
  };
  const centers = sampleSwirlCenters(
    {
      grid: { width: 96, height: 48 },
      density: parameters.swirlDensity,
      force: parameters.force,
      renderWidth: parameters.renderWidth,
      renderHeight: parameters.renderHeight,
      minimumAngleDegrees: parameters.swirlMinimumAngleDegrees,
      strengthPercent: parameters.swirlStrengthPercent,
      swirlFalloff: parameters.swirlFalloff,
      directionBias: parameters.swirlDirectionBias,
    },
    new SeededRandom("spacing"),
  );
  const shortSide = Math.min(parameters.renderWidth, parameters.renderHeight);
  const minimumRadius = minSwirlRadiusInWorldUnits(parameters) / shortSide;
  const maximumRadius = maxSwirlRadiusInWorldUnits(parameters) / shortSide;

  assert.ok(centers.length > 0);
  assert.ok(centers.every((center) => center.radius >= minimumRadius - 1e-7));
  assert.ok(centers.every((center) => center.radius <= maximumRadius + 1e-7));
  assert.ok(centers.some((center) => center.radius > minimumRadius + 1e-3));
});

void test("sampled swirl supports do not overlap", () => {
  const grid = { width: 96, height: 48 };
  const metricScales = shortSideMetricScales(grid);
  const centers = sampleSwirlCenters(
    {
      grid,
      density: 48,
      force: DEFAULT_PARAMETERS.force,
      renderWidth: DEFAULT_PARAMETERS.renderWidth,
      renderHeight: DEFAULT_PARAMETERS.renderHeight,
      minimumAngleDegrees: DEFAULT_PARAMETERS.swirlMinimumAngleDegrees,
      strengthPercent: DEFAULT_PARAMETERS.swirlStrengthPercent,
      swirlFalloff: DEFAULT_PARAMETERS.swirlFalloff,
      directionBias: 0.5,
    },
    new SeededRandom("non-overlap"),
  );

  for (let firstIndex = 0; firstIndex < centers.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < centers.length;
      secondIndex += 1
    ) {
      const firstCenter = centers[firstIndex];
      const secondCenter = centers[secondIndex];
      const distance = Math.hypot(
        (firstCenter.positionX - secondCenter.positionX) * metricScales.xScale,
        (firstCenter.positionY - secondCenter.positionY) * metricScales.yScale,
      );

      assert.ok(distance + 1e-7 >= firstCenter.radius + secondCenter.radius);
    }
  }
});

void test("swirl direction bias controls clockwise versus counterclockwise ratio", () => {
  const lowBiasCenters = sampleSwirlCenters(
    {
      grid: DEFAULT_GRID,
      density: 48,
      force: DEFAULT_PARAMETERS.force,
      renderWidth: DEFAULT_PARAMETERS.renderWidth,
      renderHeight: DEFAULT_PARAMETERS.renderHeight,
      minimumAngleDegrees: DEFAULT_PARAMETERS.swirlMinimumAngleDegrees,
      strengthPercent: DEFAULT_PARAMETERS.swirlStrengthPercent,
      swirlFalloff: DEFAULT_PARAMETERS.swirlFalloff,
      directionBias: 0,
    },
    new SeededRandom("bias-low"),
  );
  const balancedCenters = sampleSwirlCenters(
    {
      grid: DEFAULT_GRID,
      density: 48,
      force: DEFAULT_PARAMETERS.force,
      renderWidth: DEFAULT_PARAMETERS.renderWidth,
      renderHeight: DEFAULT_PARAMETERS.renderHeight,
      minimumAngleDegrees: DEFAULT_PARAMETERS.swirlMinimumAngleDegrees,
      strengthPercent: DEFAULT_PARAMETERS.swirlStrengthPercent,
      swirlFalloff: DEFAULT_PARAMETERS.swirlFalloff,
      directionBias: 0.5,
    },
    new SeededRandom("bias-mid"),
  );
  const highBiasCenters = sampleSwirlCenters(
    {
      grid: DEFAULT_GRID,
      density: 48,
      force: DEFAULT_PARAMETERS.force,
      renderWidth: DEFAULT_PARAMETERS.renderWidth,
      renderHeight: DEFAULT_PARAMETERS.renderHeight,
      minimumAngleDegrees: DEFAULT_PARAMETERS.swirlMinimumAngleDegrees,
      strengthPercent: DEFAULT_PARAMETERS.swirlStrengthPercent,
      swirlFalloff: DEFAULT_PARAMETERS.swirlFalloff,
      directionBias: 1,
    },
    new SeededRandom("bias-high"),
  );

  assert.ok(lowBiasCenters.every((center) => center.direction === -1));
  assert.ok(highBiasCenters.every((center) => center.direction === 1));
  assert.ok(balancedCenters.some((center) => center.direction === -1));
  assert.ok(balancedCenters.some((center) => center.direction === 1));
});

void test("spectral radius stays isotropic on rectangular grids", () => {
  const grid = { width: 96, height: 48 };
  const horizontalRadius = frequencyRadiusInLongestSideUnits(2, 0, grid);
  const verticalRadius = frequencyRadiusInLongestSideUnits(0, 1, grid);

  assert.ok(Math.abs(horizontalRadius - verticalRadius) < 1e-9);
});

void test("swirl influence follows chord geometry for a local rotation", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    swirlStrengthPercent: 90,
    swirlFalloff: 1,
  };
  const field = evaluateSwirlInfluence(
    { width: 5, height: 5 },
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.5,
        strengthDegrees: 90,
        direction: 1,
      },
    ],
    parameters,
  );

  const pointColumn = 3;
  const pointRow = 2;
  const pointIndex = pointRow * 5 + pointColumn;
  assert.ok(Math.abs(field.vectorX[pointIndex] + 0.25) < 1e-6);
  assert.ok(Math.abs(field.vectorY[pointIndex] - 0.25) < 1e-6);
});

void test("swirl displacement is suppressed only in tiny center and edge dead zones", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    swirlStrengthPercent: 180,
    swirlFalloff: 2,
  };
  const grid = { width: 201, height: 201 };
  const field = evaluateSwirlInfluence(
    grid,
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.4,
        strengthDegrees: 180,
        direction: 1,
      },
    ],
    parameters,
  );

  const centerDeadZoneIndex = indexAt(101, 100, grid);
  const interiorIndex = indexAt(112, 100, grid);
  const edgeInteriorIndex = indexAt(172, 100, grid);
  const edgeDeadZoneIndex = indexAt(179, 100, grid);
  const centerDeadZoneMagnitude = Math.hypot(
    field.vectorX[centerDeadZoneIndex],
    field.vectorY[centerDeadZoneIndex],
  );
  const interiorMagnitude = Math.hypot(
    field.vectorX[interiorIndex],
    field.vectorY[interiorIndex],
  );
  const edgeInteriorMagnitude = Math.hypot(
    field.vectorX[edgeInteriorIndex],
    field.vectorY[edgeInteriorIndex],
  );
  const edgeDeadZoneMagnitude = Math.hypot(
    field.vectorX[edgeDeadZoneIndex],
    field.vectorY[edgeDeadZoneIndex],
  );

  assert.ok(interiorMagnitude > centerDeadZoneMagnitude * 20);
  assert.ok(edgeInteriorMagnitude > edgeDeadZoneMagnitude * 20);
});

void test("swirl noise gain fades from the center to the boundary", () => {
  const field = evaluateSwirlInfluence(
    { width: 101, height: 101 },
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.4,
        strengthDegrees: 180,
        direction: 1,
      },
    ],
    DEFAULT_PARAMETERS,
  );

  const grid = { width: 101, height: 101 };
  const nearCenterIndex = indexAt(51, 50, grid);
  const midRadiusIndex = indexAt(70, 50, grid);
  const nearEdgeIndex = indexAt(89, 50, grid);
  const nearCenterMagnitude = Math.hypot(field.noiseGain[nearCenterIndex], 0);
  const midRadiusMagnitude = Math.hypot(field.noiseGain[midRadiusIndex], 0);
  const nearEdgeMagnitude = Math.hypot(field.noiseGain[nearEdgeIndex], 0);

  assert.ok(nearCenterMagnitude < 0.02);
  assert.ok(midRadiusMagnitude > nearCenterMagnitude);
  assert.ok(nearEdgeMagnitude > 0.95);
});

void test("swirl displacement is periodic for full turns", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    swirlStrengthPercent: 360,
    swirlFalloff: 1,
  };
  const field = evaluateSwirlInfluence(
    { width: 5, height: 5 },
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.5,
        strengthDegrees: 360,
        direction: 1,
      },
    ],
    parameters,
  );

  const pointIndex = indexAt(3, 2, { width: 5, height: 5 });
  assert.ok(
    Math.hypot(field.vectorX[pointIndex], field.vectorY[pointIndex]) < 1e-6,
  );
});

void test("swirl influence stays isotropic on rectangular grids", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    swirlStrengthPercent: 90,
    swirlFalloff: 1,
  };
  const grid = { width: 33, height: 17 };
  const field = evaluateSwirlInfluence(
    grid,
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.3,
        strengthDegrees: 90,
        direction: 1,
      },
    ],
    parameters,
  );

  const horizontalIndex = indexAt(18, 8, grid);
  const verticalIndex = indexAt(16, 10, grid);
  const horizontalMagnitude = Math.hypot(
    field.vectorX[horizontalIndex],
    field.vectorY[horizontalIndex],
  );
  const verticalMagnitude = Math.hypot(
    field.vectorX[verticalIndex],
    field.vectorY[verticalIndex],
  );

  assert.ok(Math.abs(horizontalMagnitude - verticalMagnitude) < 0.01);
});

void test("shared budget allocator preserves subcritical requested vectors", () => {
  const composed = composeWithSharedBudget(18, 0, 12, 0, 40);

  assert.ok(Math.abs(composed.x - 30) < 1e-9);
  assert.ok(Math.abs(composed.y) < 1e-9);
});

void test("shared budget allocator blends toward a swirl-heavy ratio under overload", () => {
  const composed = composeWithSharedBudget(35, 0, 0, 25, 40);
  const requestedShare = 35 / (35 + 25);
  const overload = (Math.hypot(35, 25) - 40) / 40;
  const swirlShare = requestedShare + (0.6 - requestedShare) * overload;
  const noiseShare = 1 - swirlShare;

  assert.ok(Math.abs(composed.x - swirlShare * 40) < 1e-9);
  assert.ok(Math.abs(composed.y - noiseShare * 40) < 1e-9);
});

void test("swirl displacement stays isotropic on wide render sizes", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    renderWidth: 1600,
    renderHeight: 400,
    swirlStrengthPercent: 90,
    swirlFalloff: 1,
  };
  const grid = { width: 33, height: 17 };
  const field = evaluateSwirlInfluence(
    grid,
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.3,
        strengthDegrees: 90,
        direction: 1,
      },
    ],
    parameters,
  );
  const horizontalIndex = indexAt(18, 8, grid);
  const verticalIndex = indexAt(16, 10, grid);
  const horizontalMagnitude = Math.hypot(
    field.vectorX[horizontalIndex] * parameters.renderWidth,
    field.vectorY[horizontalIndex] * parameters.renderHeight,
  );
  const verticalMagnitude = Math.hypot(
    field.vectorX[verticalIndex] * parameters.renderWidth,
    field.vectorY[verticalIndex] * parameters.renderHeight,
  );

  assert.ok(
    Math.abs(horizontalMagnitude - verticalMagnitude) /
      Math.max(horizontalMagnitude, verticalMagnitude) <
      0.04,
  );
});

void test("force still scales the noise contribution outside swirl support", () => {
  const lowForceField = generateDisplacementField({
    ...DEFAULT_PARAMETERS,
    renderWidth: 9,
    renderHeight: 9,
    gridSparseness: 1,
    force: 5,
    swirlDensity: 0,
    randomSeed: "noise-force",
  });
  const highForceField = generateDisplacementField({
    ...DEFAULT_PARAMETERS,
    renderWidth: 9,
    renderHeight: 9,
    gridSparseness: 1,
    force: 15,
    swirlDensity: 0,
    randomSeed: "noise-force",
  });

  let changedCount = 0;
  for (let index = 0; index < lowForceField.displacementX.length; index += 1) {
    const deltaX = Math.abs(
      lowForceField.displacementX[index] - highForceField.displacementX[index],
    );
    const deltaY = Math.abs(
      lowForceField.displacementY[index] - highForceField.displacementY[index],
    );
    if (deltaX > 1e-6 || deltaY > 1e-6) {
      changedCount += 1;
    }
  }

  assert.ok(changedCount > 0);
});

void test("force-resolved swirl angle shrinks as radius grows", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    force: 40,
    renderWidth: 960,
    renderHeight: 720,
    swirlMinimumAngleDegrees: 180,
    swirlStrengthPercent: 100,
    swirlFalloff: 1,
  };
  const largeRadiusAngle = resolveSwirlStrengthDegrees(parameters, 40);
  const compactRadiusAngle = resolveSwirlStrengthDegrees(parameters, 20);

  assert.ok(largeRadiusAngle > 0);
  assert.ok(largeRadiusAngle < compactRadiusAngle);
});

void test("generated field magnitudes stay within force", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    force: 40,
    swirlDensity: 18,
    swirlMinimumAngleDegrees: 180,
    swirlStrengthPercent: 100,
    swirlFalloff: 1.5,
    directionNoiseMix: 1,
    randomSeed: "force-cap-field",
  };
  const generatedField = generateVectorField(parameters, {
    width: 33,
    height: 25,
  });

  for (const value of generatedField.magnitude) {
    assert.ok(value <= parameters.force + 1e-5);
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
  assert.deepEqual(wrappedField.swirls, explicitField.swirls);
  assert.deepEqual(
    Array.from(wrappedField.amplitude),
    Array.from(explicitField.amplitude),
  );
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
    force: 99999,
    scale: 999,
    gridSparseness: 2,
    amplitudeContrast: 1.5,
    spectralSlopeDbPerOct: 999,
    showHeatmap: false,
    vectorOverlayDensity: 999,
    swirlDensity: 123,
    swirlMinimumAngleDegrees: 999,
    swirlStrengthPercent: 99999,
    swirlFalloff: 3.25,
    swirlDirectionBias: 999,
    directionNoiseMix: -4,
    randomSeed: "  tuned-seed  ",
  });

  const parsedParameters = parseParameters(parameters);

  assert.equal(parsedParameters.renderWidth, 99999);
  assert.equal(parsedParameters.renderHeight, 9);
  assert.equal(parsedParameters.force, 99999);
  assert.equal(parsedParameters.scale, 999);
  assert.equal(parsedParameters.gridSparseness, 2);
  assert.equal(parsedParameters.spectralSlopeDbPerOct, 999);
  assert.equal(parsedParameters.amplitudeContrast, 1.5);
  assert.equal(parsedParameters.showHeatmap, false);
  assert.equal(parsedParameters.vectorOverlayDensity, 999);
  assert.equal(parsedParameters.swirlDensity, 123);
  assert.equal(parsedParameters.swirlMinimumAngleDegrees, 999);
  assert.equal(parsedParameters.swirlStrengthPercent, 99999);
  assert.equal(parsedParameters.swirlFalloff, 3.25);
  assert.equal(parsedParameters.swirlDirectionBias, 999);
  assert.equal(parsedParameters.directionNoiseMix, -4);
  assert.equal(parsedParameters.randomSeed, "  tuned-seed  ");
});

void test("parameter parsing requires every parameter", () => {
  assert.throws(
    () => {
      parseParameters(
        {
          renderWidth: "640",
        },
      );
    },
    /Missing required parameter: renderHeight/,
  );
});

void test("parameter parsing rejects non-computable numeric values", () => {
  assert.throws(
    () => {
      parseParameters(createParameterObject({ renderHeight: 0 }));
    },
    /Invalid parameter renderHeight: must be >= 1/,
  );

  assert.throws(
    () => {
      parseParameters(createParameterObject({ gridSparseness: 0 }));
    },
    /Invalid parameter gridSparseness: must be >= 1/,
  );

  assert.throws(
    () => {
      parseParameters(createParameterObject({ amplitudeContrast: -1 }));
    },
    /Invalid parameter amplitudeContrast: must be >= 0/,
  );

  assert.throws(
    () => {
      parseParameters(createParameterObject({ showHeatmap: "maybe" }));
    },
    /Invalid parameter showHeatmap: must be boolean/,
  );
});

void test("schema validation rejects null parameter values", () => {
  assert.throws(
    () => {
      validateParameters({
        ...DEFAULT_PARAMETERS,
        renderWidth: null,
      });
    },
    /Invalid parameter renderWidth: must be integer/,
  );
});

void test("spectral filtering normalizes noise into unit range", () => {
  const random = new SeededRandom("spectral");
  const noise = generateWhiteNoise({ width: 8, height: 8 }, random);
  const filtered = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
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
    spectralSlopeDbPerOct: 0,
  });
  const highSlope = applySpectralFilter(noise, {
    cutoffPercent: DEFAULT_PARAMETERS.scale,
    spectralSlopeDbPerOct: 9,
  });

  assert.ok(measureFieldRoughness(highSlope) < measureFieldRoughness(lowSlope));
});

void test("higher cutoff percent preserves finer spatial variation", () => {
  const random = new SeededRandom("cutoff-comparison");
  const noise = generateWhiteNoise({ width: 32, height: 32 }, random);
  const lowCutoff = applySpectralFilter(noise, {
    cutoffPercent: MIN_CUTOFF_PERCENT,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });
  const highCutoff = applySpectralFilter(noise, {
    cutoffPercent: MAX_CUTOFF_PERCENT,
    spectralSlopeDbPerOct: DEFAULT_PARAMETERS.spectralSlopeDbPerOct,
  });

  assert.ok(
    measureFieldRoughness(highCutoff) > measureFieldRoughness(lowCutoff),
  );
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
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...DEFAULT_PARAMETERS,
    ...overrides,
  };
}
