import test from "node:test";
import assert from "node:assert/strict";

import { shapeAmplitudeField } from "../src/field/amplitude.js";
import { DEFAULT_GRID, createGridFromSparseness } from "../src/field/grid.js";
import {
  densityToPoissonRadius,
  sampleSwirlCenters,
} from "../src/field/poissonDisk.js";
import { SeededRandom } from "../src/field/rng.js";
import {
  generateWhiteNoise,
  applySpectralFilter,
} from "../src/field/spectralNoise.js";
import {
  DEFAULT_PARAMETERS,
  MAX_FORCE,
  MAX_SPECTRAL_SLOPE_DB_PER_OCT,
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
    amplitudeMin: 0.2,
    amplitudeMax: 0.8,
    amplitudeContrast: 1,
  };

  const shapedValues = shapeAmplitudeField(field, parameters);

  assert.ok(Math.abs(shapedValues[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(shapedValues[3] - 0.8) < 1e-6);
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
  const centers = sampleSwirlCenters(
    {
      density,
      radius: 0.2,
      strength: 1,
      directionRandomness: 1,
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
        firstCenter.positionX - secondCenter.positionX,
        firstCenter.positionY - secondCenter.positionY,
      );
      assert.ok(distance + 1e-7 >= minimumDistance);
    }
  }
});

void test("parameter parsing clamps numeric values and preserves a seed", () => {
  const searchParams = new URLSearchParams({
    force: "999",
    gridSparseness: "0",
    spectralSlopeDbPerOct: "999",
    showHeatmap: "false",
    vectorOverlayDensity: "999",
    amplitudeMin: "0.9",
    amplitudeMax: "0.2",
    randomSeed: "  tuned-seed  ",
  });

  const parsedParameters = parseParameters(searchParams);

  assert.equal(parsedParameters.force, MAX_FORCE);
  assert.equal(parsedParameters.gridSparseness, 1);
  assert.equal(
    parsedParameters.spectralSlopeDbPerOct,
    MAX_SPECTRAL_SLOPE_DB_PER_OCT,
  );
  assert.equal(parsedParameters.showHeatmap, false);
  assert.equal(parsedParameters.vectorOverlayDensity, 64);
  assert.equal(parsedParameters.amplitudeMin, 0.2);
  assert.equal(parsedParameters.amplitudeMax, 0.9);
  assert.equal(parsedParameters.randomSeed, "tuned-seed");
});

void test("spectral filtering normalizes noise into unit range", () => {
  const random = new SeededRandom("spectral");
  const noise = generateWhiteNoise({ width: 8, height: 8 }, random);
  const filtered = applySpectralFilter(noise, {
    scale: DEFAULT_PARAMETERS.magnitudeScale,
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
    scale: DEFAULT_PARAMETERS.magnitudeScale,
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
    scale: DEFAULT_PARAMETERS.magnitudeScale,
    spectralSlopeDbPerOct: 0,
  });
  const highSlope = applySpectralFilter(noise, {
    scale: DEFAULT_PARAMETERS.magnitudeScale,
    spectralSlopeDbPerOct: 9,
  });

  assert.ok(measureFieldRoughness(highSlope) < measureFieldRoughness(lowSlope));
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
    for (let columnIndex = 0; columnIndex < field.grid.width; columnIndex += 1) {
      const index = rowIndex * field.grid.width + columnIndex;
      if (columnIndex + 1 < field.grid.width) {
        differenceTotal += Math.abs(field.values[index] - field.values[index + 1]);
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
