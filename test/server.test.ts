import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { renderFieldSvg } from "../src/server/renderSvg.js";
import { createAppServer } from "../src/server/server.js";
import { decodeDisplacementField } from "../src/shared/displacementBinary.js";
import type { VectorField } from "../src/shared/types.js";

void test("html and browser module routes are served from source", async () => {
  const server = createAppServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const htmlResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/`,
    );
    const html = await htmlResponse.text();
    const clientModuleResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/src/client/index.js`,
    );
    const clientModule = await clientModuleResponse.text();
    const sharedModuleResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/src/shared/params.js`,
    );
    const sharedModule = await sharedModuleResponse.text();
    const missingModuleResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/src/client/missing.js`,
    );
    const traversalResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/src/%2e%2e/package.js`,
    );

    assert.equal(htmlResponse.status, 200);
    assert.match(htmlResponse.headers.get("content-type") ?? "", /text\/html/);
    assert.match(html, /<script type="module" src="\/src\/client\/index\.js">\s*<\/script>/);

    assert.equal(clientModuleResponse.status, 200);
    assert.match(
      clientModuleResponse.headers.get("content-type") ?? "",
      /application\/javascript/,
    );
    assert.match(
      clientModule,
      /import \{ decodeDisplacementField \} from "\.\.\/shared\/displacementBinary\.js";/,
    );
    assert.match(
      clientModule,
      /const currentParameters\s*=\s*normalizeParameters\(\{/,
    );
    assert.doesNotMatch(clientModule, /HTMLFormElement/);
    assert.doesNotMatch(clientModule, /type BooleanParameterDefinition/);

    assert.equal(sharedModuleResponse.status, 200);
    assert.match(
      sharedModuleResponse.headers.get("content-type") ?? "",
      /application\/javascript/,
    );
    assert.match(sharedModule, /export const DEFAULT_PARAMETERS\s*=\s*\{/);
    assert.doesNotMatch(sharedModule, /import type/);

    assert.equal(missingModuleResponse.status, 404);
    assert.equal(traversalResponse.status, 404);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

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
    const wideSwirlResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&swirlMinimumAngleDegrees=30`,
    );
    const wideSwirlSvg = await wideSwirlResponse.text();
    const tightSwirlResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&swirlMinimumAngleDegrees=180`,
    );
    const tightSwirlSvg = await tightSwirlResponse.text();
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
    assert.equal(wideSwirlResponse.status, 200);
    assert.equal(tightSwirlResponse.status, 200);
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
    assert.notEqual(wideSwirlSvg, tightSwirlSvg);
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
