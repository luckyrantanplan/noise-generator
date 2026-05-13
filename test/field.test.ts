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
import { generateVectorField } from "../src/field/composeField.js";
import { evaluateSwirlInfluence } from "../src/field/swirls.js";
import {
  frequencyRadiusInLongestSideUnits,
  generateWhiteNoise,
  applySpectralFilter,
} from "../src/field/spectralNoise.js";
import {
  DEFAULT_PARAMETERS,
  MAX_FORCE,
  MAX_CUTOFF_PERCENT,
  MAX_SPECTRAL_SLOPE_DB_PER_OCT,
  MAX_SWIRL_RADIUS_PERCENT,
  MIN_CUTOFF_PERCENT,
  parseParameters,
} from "../src/shared/params.js";
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

void test("poisson sampler respects minimum spacing", () => {
  const density = 16;
  const minimumDistance = densityToPoissonRadius(density);
  const grid = { width: 96, height: 48 };
  const metricScales = shortSideMetricScales(grid);
  const centers = sampleSwirlCenters(
    {
      grid,
      density,
      radius: 0.2,
      strength: 1,
      directionBias: 0.5,
    },
    new SeededRandom("spacing"),
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
      assert.ok(distance + 1e-7 >= minimumDistance);
    }
  }
});

void test("swirl direction bias controls clockwise versus counterclockwise ratio", () => {
  const lowBiasCenters = sampleSwirlCenters(
    {
      grid: DEFAULT_GRID,
      density: 48,
      radius: 0.2,
      strength: 1,
      directionBias: 0,
    },
    new SeededRandom("bias-low"),
  );
  const balancedCenters = sampleSwirlCenters(
    {
      grid: DEFAULT_GRID,
      density: 48,
      radius: 0.2,
      strength: 1,
      directionBias: 0.5,
    },
    new SeededRandom("bias-mid"),
  );
  const highBiasCenters = sampleSwirlCenters(
    {
      grid: DEFAULT_GRID,
      density: 48,
      radius: 0.2,
      strength: 1,
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
    swirlStrength: Math.PI / 2,
    swirlFalloff: 1,
  };
  const field = evaluateSwirlInfluence(
    { width: 5, height: 5 },
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.5,
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

void test("swirl displacement peaks between center and edge", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    swirlStrength: Math.PI,
    swirlFalloff: 2,
  };
  const grid = { width: 101, height: 101 };
  const field = evaluateSwirlInfluence(
    grid,
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.4,
        direction: 1,
      },
    ],
    parameters,
  );

  const nearCenterIndex = indexAt(51, 50, grid);
  const midRingIndex = indexAt(70, 50, grid);
  const nearEdgeIndex = indexAt(89, 50, grid);
  const nearCenterMagnitude = Math.hypot(
    field.vectorX[nearCenterIndex],
    field.vectorY[nearCenterIndex],
  );
  const midRingMagnitude = Math.hypot(
    field.vectorX[midRingIndex],
    field.vectorY[midRingIndex],
  );
  const nearEdgeMagnitude = Math.hypot(
    field.vectorX[nearEdgeIndex],
    field.vectorY[nearEdgeIndex],
  );

  assert.ok(midRingMagnitude > nearCenterMagnitude * 20);
  assert.ok(midRingMagnitude > nearEdgeMagnitude * 20);
});

void test("swirl displacement is periodic for full turns", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    swirlStrength: Math.PI * 2,
    swirlFalloff: 1,
  };
  const field = evaluateSwirlInfluence(
    { width: 5, height: 5 },
    [
      {
        positionX: 0.5,
        positionY: 0.5,
        radius: 0.5,
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
    swirlStrength: Math.PI / 2,
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

void test("direction noise mix zero keeps full swirl chords and preserves background noise", () => {
  const parameters = {
    ...DEFAULT_PARAMETERS,
    force: 1,
    directionNoiseMix: 0,
    swirlDensity: 1,
    swirlRadius: 45,
    swirlStrength: Math.PI / 2,
    swirlFalloff: 1,
    randomSeed: "pure-swirl",
  };
  const grid = { width: 9, height: 9 };
  const generatedField = generateVectorField(parameters, grid);
  const noiseOnlyField = generateVectorField(
    {
      ...parameters,
      swirlDensity: 0,
    },
    grid,
  );
  const swirlField = evaluateSwirlInfluence(
    grid,
    generatedField.swirls,
    parameters,
  );
  let outsideSupportCount = 0;
  let insideSupportCount = 0;

  for (let index = 0; index < generatedField.displacementX.length; index += 1) {
    if (swirlField.weight[index] > 1e-6) {
      insideSupportCount += 1;
      assert.ok(
        Math.abs(
          generatedField.displacementX[index] -
            swirlField.vectorX[index] * parameters.renderWidth,
        ) < 2e-5,
      );
      assert.ok(
        Math.abs(
          generatedField.displacementY[index] -
            swirlField.vectorY[index] * parameters.renderHeight,
        ) < 2e-5,
      );
      continue;
    }

    outsideSupportCount += 1;
    assert.ok(
      Math.abs(
        generatedField.displacementX[index] -
          noiseOnlyField.displacementX[index],
      ) < 1e-6,
    );
    assert.ok(
      Math.abs(
        generatedField.displacementY[index] -
          noiseOnlyField.displacementY[index],
      ) < 1e-6,
    );
  }

  assert.ok(outsideSupportCount > 0);
  assert.ok(insideSupportCount > 0);
});

void test("force does not scale swirl chord length", () => {
  const baseParameters = {
    ...DEFAULT_PARAMETERS,
    directionNoiseMix: 0,
    swirlDensity: 1,
    swirlRadius: 45,
    swirlStrength: Math.PI / 2,
    swirlFalloff: 1,
    randomSeed: "force-invariant-swirl",
  };
  const grid = { width: 9, height: 9 };
  const lowForceField = generateVectorField(
    {
      ...baseParameters,
      force: 1,
    },
    grid,
  );
  const highForceField = generateVectorField(
    {
      ...baseParameters,
      force: 7,
    },
    grid,
  );
  const swirlField = evaluateSwirlInfluence(grid, lowForceField.swirls, {
    ...baseParameters,
    force: 1,
  });
  let insideSupportCount = 0;

  for (let index = 0; index < lowForceField.displacementX.length; index += 1) {
    if (swirlField.weight[index] <= 1e-6) {
      continue;
    }

    insideSupportCount += 1;
    assert.ok(
      Math.abs(
        lowForceField.displacementX[index] -
          highForceField.displacementX[index],
      ) < 2e-5,
    );
    assert.ok(
      Math.abs(
        lowForceField.displacementY[index] -
          highForceField.displacementY[index],
      ) < 2e-5,
    );
  }

  assert.ok(insideSupportCount > 0);
});

void test("parameter parsing clamps numeric values and preserves a seed", () => {
  const searchParams = new URLSearchParams({
    renderWidth: "99999",
    renderHeight: "0",
    force: "999",
    scale: "999",
    gridSparseness: "0",
    spectralSlopeDbPerOct: "999",
    showHeatmap: "false",
    vectorOverlayDensity: "999",
    swirlRadius: "999",
    swirlDirectionBias: "999",
    randomSeed: "  tuned-seed  ",
  });

  const parsedParameters = parseParameters(searchParams);

  assert.equal(parsedParameters.renderWidth, 1920);
  assert.equal(parsedParameters.renderHeight, 180);
  assert.equal(parsedParameters.force, MAX_FORCE);
  assert.equal(parsedParameters.scale, MAX_CUTOFF_PERCENT);
  assert.equal(parsedParameters.gridSparseness, 1);
  assert.equal(
    parsedParameters.spectralSlopeDbPerOct,
    MAX_SPECTRAL_SLOPE_DB_PER_OCT,
  );
  assert.equal(parsedParameters.showHeatmap, false);
  assert.equal(parsedParameters.vectorOverlayDensity, 64);
  assert.equal(parsedParameters.swirlRadius, MAX_SWIRL_RADIUS_PERCENT);
  assert.equal(parsedParameters.swirlDirectionBias, 1);
  assert.equal(parsedParameters.randomSeed, "tuned-seed");
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

  return differenceTotal / comparisonCount;
}
