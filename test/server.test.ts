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
    const sparseResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&vectorOverlayDensity=8&heatmapCellSize=4`,
    );
    const sparseSvg = await sparseResponse.text();
    const sparsityResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&gridSparseness=10`,
    );
    const sparsitySvg = await sparsityResponse.text();
    const denseGridResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&gridSparseness=1&showHeatmap=false`,
    );
    const denseGridSvg = await denseGridResponse.text();
    const vectorOnlyResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg?randomSeed=test-seed&force=20&showHeatmap=false`,
    );
    const vectorOnlySvg = await vectorOnlyResponse.text();

    assert.equal(response.status, 200);
    assert.equal(sparseResponse.status, 200);
    assert.equal(sparsityResponse.status, 200);
    assert.equal(denseGridResponse.status, 200);
    assert.equal(vectorOnlyResponse.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(svg, /^<svg/);
    assert.match(svg, /<line/);
    assert.match(svg, /Scale \(SVG units\)/);
    assert.ok(countSvgTag(svg, "line") > countSvgTag(sparseSvg, "line"));
    assert.ok(countSvgTag(svg, "rect") > countSvgTag(sparseSvg, "rect"));
    assert.equal(countSvgTag(sparsitySvg, "rect"), 96 * 72 + 1);
    assert.match(denseGridSvg, /^<svg/);
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
