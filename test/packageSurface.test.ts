import test from "node:test";
import assert from "node:assert/strict";

import { generateDisplacementField } from "../index.js";
import type { ParameterValues } from "../index.js";

void test("root package exports the minimal field generation API", () => {
  const parameters: ParameterValues = {
    renderWidth: 320,
    renderHeight: 240,
    force: 80,
    scale: 4.5,
    gridSparseness: 20,
    showHeatmap: true,
    vectorOverlayDensity: 16,
    spectralSlopeDbPerOct: 6,
    amplitudeContrast: 1,
    swirlDensity: 18,
    swirlMinimumAngleDegrees: 180,
    swirlStrengthPercent: 60,
    swirlFalloff: 2,
    swirlDirectionBias: 0.5,
    directionNoiseMix: 0.45,
    randomSeed: "package-surface",
  };
  const wrappedField = generateDisplacementField(parameters);

  assert.deepEqual(wrappedField.grid, { width: 16, height: 12 });
  assert.equal(wrappedField.magnitude.length, 16 * 12);
});