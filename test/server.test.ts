import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { createAppServer } from "../src/server/server.js";

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

    assert.equal(response.status, 200);
    assert.equal(sparseVectorResponse.status, 200);
    assert.equal(denseGridResponse.status, 200);
    assert.equal(coarseGridResponse.status, 200);
    assert.equal(lowForceResponse.status, 200);
    assert.equal(highForceResponse.status, 200);
    assert.equal(tightSwirlResponse.status, 200);
    assert.equal(broadSwirlResponse.status, 200);
    assert.equal(vectorOnlyResponse.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(svg, /^<svg/);
    assert.match(svg, /<line/);
    assert.match(svg, /Scale \(SVG units\)/);
    assert.ok(countSvgTag(svg, "line") > countSvgTag(sparseVectorSvg, "line"));
    assert.equal(countSvgTag(svg, "rect"), countSvgTag(sparseVectorSvg, "rect"));
    assert.match(denseGridSvg, /^<svg/);
    assert.equal(countSvgTag(denseGridSvg, "rect"), 96 * 72 + 1);
    assert.equal(countSvgTag(coarseGridSvg, "rect"), 48 * 36 + 1);
    assert.notEqual(lowForceSvg, highForceSvg);
    assert.notEqual(tightSwirlSvg, broadSwirlSvg);
    assert.equal(countSvgTag(vectorOnlySvg, "line") > 0, true);
    assert.equal(countSvgTag(vectorOnlySvg, "rect"), 1);
    assert.match(vectorOnlySvg, /Scale \(SVG units\)/);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

function countSvgTag(svg: string, tagName: string): number {
  return svg.match(new RegExp(`<${tagName}\\b`, "g"))?.length ?? 0;
}
