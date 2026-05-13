import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { renderFieldSvg } from "../src/server/renderSvg.js";
import { createAppServer } from "../src/server/server.js";
import { decodeDisplacementField } from "../src/shared/displacementBinary.js";
import type { VectorField } from "../src/shared/types.js";

void test("field endpoint returns generated SVG", async () => {
  const server = createAppServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20`,
    );
    const svg = await response.text();
    const sparseVectorResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&vectorOverlayDensity=8`,
    );
    const sparseVectorSvg = await sparseVectorResponse.text();
    const denseGridResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&gridSparseness=10`,
    );
    const denseGridSvg = await denseGridResponse.text();
    const coarseGridResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&gridSparseness=20`,
    );
    const coarseGridSvg = await coarseGridResponse.text();
    const lowForceResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=10&showHeatmap=false`,
    );
    const lowForceSvg = await lowForceResponse.text();
    const highForceResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=60&showHeatmap=false`,
    );
    const highForceSvg = await highForceResponse.text();
    const tightSwirlResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&swirlRadius=5`,
    );
    const tightSwirlSvg = await tightSwirlResponse.text();
    const broadSwirlResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&swirlRadius=30`,
    );
    const broadSwirlSvg = await broadSwirlResponse.text();
    const vectorOnlyResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&showHeatmap=false`,
    );
    const vectorOnlySvg = await vectorOnlyResponse.text();
    const customSizeResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&renderWidth=640&renderHeight=480`,
    );
    const customSizeSvg = await customSizeResponse.text();
    const binaryResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.bin?randomSeed=test-seed&renderWidth=640&renderHeight=480&gridSparseness=20`,
    );
    const binaryBytes = new Uint8Array(await binaryResponse.arrayBuffer());
    const decodedBinary = decodeDisplacementField(binaryBytes);

    assert.equal(response.status, 200);
    assert.equal(sparseVectorResponse.status, 200);
    assert.equal(denseGridResponse.status, 200);
    assert.equal(coarseGridResponse.status, 200);
    assert.equal(lowForceResponse.status, 200);
    assert.equal(highForceResponse.status, 200);
    assert.equal(tightSwirlResponse.status, 200);
    assert.equal(broadSwirlResponse.status, 200);
    assert.equal(vectorOnlyResponse.status, 200);
    assert.equal(customSizeResponse.status, 200);
    assert.equal(binaryResponse.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(
      binaryResponse.headers.get("content-type") ?? "",
      /application\/octet-stream/,
    );
    assert.match(svg, /^<svg/);
    assert.match(svg, /<line/);
    assert.match(svg, /Scale \(SVG units\)/);
    assert.ok(countSvgTag(svg, "line") > countSvgTag(sparseVectorSvg, "line"));
    assert.equal(
      countSvgTag(svg, "rect"),
      countSvgTag(sparseVectorSvg, "rect"),
    );
    assert.match(denseGridSvg, /^<svg/);
    assert.equal(countSvgTag(denseGridSvg, "rect"), 96 * 72 + 1);
    assert.equal(countSvgTag(coarseGridSvg, "rect"), 48 * 36 + 1);
    assert.notEqual(lowForceSvg, highForceSvg);
    assert.notEqual(tightSwirlSvg, broadSwirlSvg);
    assert.equal(countSvgTag(vectorOnlySvg, "line") > 0, true);
    assert.equal(countSvgTag(vectorOnlySvg, "rect"), 1);
    assert.match(vectorOnlySvg, /Scale \(SVG units\)/);
    assert.match(customSizeSvg, /width="640"/);
    assert.match(customSizeSvg, /height="480"/);
    assert.match(customSizeSvg, /viewBox="0 0 640 480"/);
    assert.equal(String.fromCharCode(...binaryBytes.slice(0, 4)), "DFLD");
    assert.equal(decodedBinary.metadata.parameters.randomSeed, "test-seed");
    assert.equal(decodedBinary.metadata.renderWidth, 640);
    assert.equal(decodedBinary.metadata.renderHeight, 480);
    assert.deepEqual(decodedBinary.metadata.grid, { width: 32, height: 24 });
    assert.equal(decodedBinary.displacements.length, 32 * 24 * 2);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

void test("zero-magnitude vectors do not render fallback arrows", () => {
  const zeroField: VectorField = {
    grid: { width: 2, height: 2 },
    amplitude: new Float32Array(4),
    direction: new Float32Array(4),
    displacementX: new Float32Array(4),
    displacementY: new Float32Array(4),
    magnitude: new Float32Array(4),
    swirls: [],
  };

  const svg = renderFieldSvg(zeroField, {
    width: 100,
    height: 80,
    showHeatmap: false,
    vectorOverlayDensity: 16,
  });

  assert.equal(countSvgTag(svg, "line"), 4);
});

void test("rendered arrows use actual displacement geometry", () => {
  const field: VectorField = {
    grid: { width: 1, height: 1 },
    amplitude: new Float32Array([0]),
    direction: new Float32Array([0]),
    displacementX: new Float32Array([10]),
    displacementY: new Float32Array([-16]),
    magnitude: new Float32Array([Math.hypot(10, 16)]),
    swirls: [],
  };

  const svg = renderFieldSvg(field, {
    width: 100,
    height: 80,
    showHeatmap: false,
    vectorOverlayDensity: 16,
  });

  assert.match(svg, /x1="0" y1="0" x2="10" y2="-16"/);
});

function countSvgTag(svg: string, tagName: string): number {
  return svg.match(new RegExp(`<${tagName}\\b`, "g"))?.length ?? 0;
}
