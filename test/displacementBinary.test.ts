import test from "node:test";
import assert from "node:assert/strict";

import {
  createDisplacementMetadata,
  decodeDisplacementField,
  encodeDisplacementField,
  interleaveDisplacements,
} from "../src/shared/displacementBinary.js";
import { DEFAULT_PARAMETERS } from "../src/shared/params.js";

void test("displacement binary codec preserves row-major dx dy packing", () => {
  const metadata = createDisplacementMetadata({
    parameters: {
      ...DEFAULT_PARAMETERS,
      randomSeed: "codec-seed",
      renderWidth: 4,
      renderHeight: 2,
    },
    grid: { width: 2, height: 1 },
    renderWidth: 4,
    renderHeight: 2,
  });
  const displacements = interleaveDisplacements(
    new Float32Array([1, 3]),
    new Float32Array([2, 4]),
  );

  assert.deepEqual(Array.from(displacements), [1, 2, 3, 4]);

  const encoded = encodeDisplacementField(metadata, displacements);
  const decoded = decodeDisplacementField(encoded);

  assert.equal(decoded.metadata.parameters.randomSeed, "codec-seed");
  assert.deepEqual(decoded.metadata.grid, { width: 2, height: 1 });
  assert.deepEqual(Array.from(decoded.displacements), [1, 2, 3, 4]);
});

void test("displacement binary decoder rejects version 2 payloads", () => {
  const metadata = createDisplacementMetadata({
    parameters: DEFAULT_PARAMETERS,
    grid: { width: 1, height: 1 },
    renderWidth: DEFAULT_PARAMETERS.renderWidth,
    renderHeight: DEFAULT_PARAMETERS.renderHeight,
  });
  const displacements = interleaveDisplacements(
    new Float32Array([1]),
    new Float32Array([2]),
  );
  const encoded = encodeDisplacementField(metadata, displacements);

  encoded[4] = 2;

  assert.throws(
    () => decodeDisplacementField(encoded),
    /Unsupported binary displacement version: 2/,
  );
});
