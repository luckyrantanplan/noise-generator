import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PARAMETERS,
  generateDisplacementField,
  generateDisplacementPreview,
  PARAMETER_DEFINITIONS,
  PARAMETER_GROUPS,
} from "../index.js";
import type { ParameterValues } from "../index.js";

void test("root package exports the supported generation and schema API", () => {
  const parameters: ParameterValues = {
    renderWidth: 320,
    renderHeight: 240,
    maxTraceLength: 80,
    targetTurnAngleDegrees: 180,
    scale: 4.5,
    silenceCutoffPercent: 100,
    gridSparseness: 20,
    showHeatmap: true,
    vectorOverlayDensity: 16,
    spectralSlopeDbPerOct: 6,
    randomSeed: "package-surface",
  };
  const wrappedField = generateDisplacementField(parameters);
  const preview = generateDisplacementPreview({
    ...parameters,
    showHeatmap: false,
  });

  assert.equal(DEFAULT_PARAMETERS.renderWidth, 960);
  assert.equal(PARAMETER_GROUPS.length, 4);
  assert.ok(PARAMETER_DEFINITIONS.length > 0);
  assert.deepEqual(wrappedField.grid, { width: 16, height: 12 });
  assert.equal(wrappedField.magnitude.length, 16 * 12);
  assert.deepEqual(preview.parameters.showHeatmap, false);
  assert.match(preview.svg, /^<svg/);
  assert.match(preview.svg, /aria-label="Generated displacement field"/);
});
