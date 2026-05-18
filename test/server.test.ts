import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { renderFieldSvg } from "../src/server/renderSvg.js";
import { createAppServer } from "../src/server/server.js";
import { decodeDisplacementField } from "../src/shared/displacementBinary.js";
import { DEFAULT_PARAMETERS } from "../src/shared/params.js";
import type { ScalarField, VectorField } from "../src/shared/types.js";

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
    assert.match(
      html,
      /<script type="module" src="\/src\/client\/index\.js">\s*<\/script>/,
    );

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
    assert.doesNotMatch(sharedModule, /from "ajv"/);
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
    const response = await postParameters(address.port, "/api/field.svg", {
      randomSeed: "test-seed",
      maxTraceLength: 20,
    });
    const svg = await response.text();
    const sparseVectorResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        maxTraceLength: 20,
        vectorOverlayDensity: 8,
      },
    );
    const sparseVectorSvg = await sparseVectorResponse.text();
    const denseGridResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        maxTraceLength: 20,
        gridSparseness: 10,
      },
    );
    const denseGridSvg = await denseGridResponse.text();
    const coarseGridResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        maxTraceLength: 20,
        gridSparseness: 20,
      },
    );
    const coarseGridSvg = await coarseGridResponse.text();
    const lowForceResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        maxTraceLength: 10,
        showHeatmap: false,
      },
    );
    const lowForceSvg = await lowForceResponse.text();
    const highForceResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        maxTraceLength: 60,
        showHeatmap: false,
      },
    );
    const highForceSvg = await highForceResponse.text();
    const tightTurnResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        targetTurnAngleDegrees: 30,
      },
    );
    const tightTurnSvg = await tightTurnResponse.text();
    const wideTurnResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        targetTurnAngleDegrees: 180,
      },
    );
    const wideTurnSvg = await wideTurnResponse.text();
    const vectorOnlyResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        maxTraceLength: 20,
        showHeatmap: false,
      },
    );
    const vectorOnlySvg = await vectorOnlyResponse.text();
    const customSizeResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        renderWidth: 640,
        renderHeight: 480,
      },
    );
    const customSizeSvg = await customSizeResponse.text();
    const largeSizeResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        randomSeed: "test-seed",
        renderWidth: 2500,
        renderHeight: 1900,
        gridSparseness: 100,
        showHeatmap: false,
        vectorOverlayDensity: 64,
      },
    );
    const largeSizeSvg = await largeSizeResponse.text();
    const binaryResponse = await postParameters(
      address.port,
      "/api/field.bin",
      {
        randomSeed: "test-seed",
        renderWidth: 640,
        renderHeight: 480,
        gridSparseness: 20,
      },
    );
    const binaryBytes = new Uint8Array(await binaryResponse.arrayBuffer());
    const decodedBinary = decodeDisplacementField(binaryBytes);
    const largeBinaryResponse = await postParameters(
      address.port,
      "/api/field.bin",
      {
        randomSeed: "test-seed",
        renderWidth: 2500,
        renderHeight: 1900,
        gridSparseness: 100,
      },
    );
    const largeBinaryBytes = new Uint8Array(
      await largeBinaryResponse.arrayBuffer(),
    );
    const largeDecodedBinary = decodeDisplacementField(largeBinaryBytes);

    assert.equal(response.status, 200);
    assert.equal(sparseVectorResponse.status, 200);
    assert.equal(denseGridResponse.status, 200);
    assert.equal(coarseGridResponse.status, 200);
    assert.equal(lowForceResponse.status, 200);
    assert.equal(highForceResponse.status, 200);
    assert.equal(tightTurnResponse.status, 200);
    assert.equal(wideTurnResponse.status, 200);
    assert.equal(vectorOnlyResponse.status, 200);
    assert.equal(customSizeResponse.status, 200);
    assert.equal(largeSizeResponse.status, 200);
    assert.equal(binaryResponse.status, 200);
    assert.equal(largeBinaryResponse.status, 200);
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
    assert.notEqual(tightTurnSvg, wideTurnSvg);
    assert.equal(countSvgTag(vectorOnlySvg, "line") > 0, true);
    assert.equal(countSvgTag(vectorOnlySvg, "rect"), 1);
    assert.match(vectorOnlySvg, /Scale \(SVG units\)/);
    assert.match(customSizeSvg, /width="640"/);
    assert.match(customSizeSvg, /height="480"/);
    assert.match(customSizeSvg, /viewBox="0 0 640 480"/);
    assert.match(largeSizeSvg, /width="2500"/);
    assert.match(largeSizeSvg, /height="1900"/);
    assert.match(largeSizeSvg, /viewBox="0 0 2500 1900"/);
    assert.equal(String.fromCharCode(...binaryBytes.slice(0, 4)), "DFLD");
    assert.equal(binaryBytes[4], 3);
    assert.equal(decodedBinary.metadata.parameters.randomSeed, "test-seed");
    assert.equal(decodedBinary.metadata.renderWidth, 640);
    assert.equal(decodedBinary.metadata.renderHeight, 480);
    assert.deepEqual(decodedBinary.metadata.grid, { width: 32, height: 24 });
    assert.equal(decodedBinary.displacements.length, 32 * 24 * 2);
    assert.equal(largeDecodedBinary.metadata.renderWidth, 2500);
    assert.equal(largeDecodedBinary.metadata.renderHeight, 1900);
    assert.deepEqual(largeDecodedBinary.metadata.grid, {
      width: 25,
      height: 19,
    });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

void test("field endpoints reject invalid parameters with bad request", async () => {
  const server = createAppServer();
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const invalidSvgResponse = await postParameters(
      address.port,
      "/api/field.svg",
      {
        renderWidth: 0,
      },
    );
    const invalidSvgBody = await invalidSvgResponse.text();
    const invalidBinaryResponse = await postParameters(
      address.port,
      "/api/field.bin",
      {
        gridSparseness: 0,
      },
    );
    const invalidBinaryBody = await invalidBinaryResponse.text();
    const missingParameterResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ renderWidth: 640 }),
      },
    );
    const missingParameterBody = await missingParameterResponse.text();
    const wrongMethodResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/field.svg`,
    );
    const wrongMethodBody = await wrongMethodResponse.text();

    assert.equal(invalidSvgResponse.status, 400);
    assert.match(invalidSvgBody, /Invalid parameter renderWidth: must be >= 1/);
    assert.equal(invalidBinaryResponse.status, 400);
    assert.match(
      invalidBinaryBody,
      /Invalid parameter gridSparseness: must be >= 1/,
    );
    assert.equal(missingParameterResponse.status, 400);
    assert.match(
      missingParameterBody,
      /Missing required parameter: renderHeight/,
    );
    assert.equal(wrongMethodResponse.status, 405);
    assert.match(wrongMethodBody, /Method Not Allowed/);
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
    direction: new Float32Array(4),
    displacementX: new Float32Array(4),
    displacementY: new Float32Array(4),
    magnitude: new Float32Array(4),
    maximumDisplacementMagnitude: 80,
  };

  const svg = renderFieldSvg(createPreviewRenderField(zeroField), {
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
    direction: new Float32Array([0]),
    displacementX: new Float32Array([10]),
    displacementY: new Float32Array([-16]),
    magnitude: new Float32Array([Math.hypot(10, 16)]),
    maximumDisplacementMagnitude: 32,
  };

  const svg = renderFieldSvg(createPreviewRenderField(field), {
    width: 100,
    height: 80,
    showHeatmap: false,
    vectorOverlayDensity: 16,
  });

  assert.match(svg, /x1="0" y1="0" x2="10" y2="-16"/);
});

void test("rendered heatmap uses the source scalar field", () => {
  const field: VectorField = {
    grid: { width: 1, height: 1 },
    direction: new Float32Array([0]),
    displacementX: new Float32Array([12]),
    displacementY: new Float32Array([16]),
    magnitude: new Float32Array([20]),
    maximumDisplacementMagnitude: 80,
  };

  const svg = renderFieldSvg(createPreviewRenderField(field, [0.25]), {
    width: 100,
    height: 80,
    showHeatmap: true,
    vectorOverlayDensity: 16,
  });

  assert.match(svg, /fill="rgb\(14 77 83\)"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
});

void test("rendered heatmap spans the full height for tall previews", () => {
  const field: VectorField = {
    grid: { width: 1, height: 3 },
    direction: new Float32Array(3),
    displacementX: new Float32Array(3),
    displacementY: new Float32Array(3),
    magnitude: new Float32Array(3),
    maximumDisplacementMagnitude: 0,
  };

  const svg = renderFieldSvg(createPreviewRenderField(field, [0, 0.5, 1]), {
    width: 40,
    height: 120,
    showHeatmap: true,
    vectorOverlayDensity: 16,
  });

  assert.match(svg, /<rect x="0" y="0" width="40" height="30" fill=/);
  assert.match(svg, /<rect x="0" y="30" width="40" height="60" fill=/);
  assert.match(svg, /<rect x="0" y="90" width="40" height="30" fill=/);
});

void test("rendered fixtures stay faithful to final displacement vectors", () => {
  const fixtures: {
    name: string;
    field: VectorField;
    scalarValues: number[];
    expectedLine: RegExp;
    expectedHeatmapFill: string;
  }[] = [
    {
      name: "short trace",
      field: {
        grid: { width: 1, height: 1 },
        direction: new Float32Array([Math.atan2(4, 3)]),
        displacementX: new Float32Array([3]),
        displacementY: new Float32Array([4]),
        magnitude: new Float32Array([5]),
        maximumDisplacementMagnitude: 10,
      },
      scalarValues: [0.5],
      expectedLine: /x1="0" y1="0" x2="3" y2="4"/,
      expectedHeatmapFill: 'fill="rgb(125 152 102)"',
    },
    {
      name: "vertical trace",
      field: {
        grid: { width: 1, height: 1 },
        direction: new Float32Array([Math.PI / 2]),
        displacementX: new Float32Array([0]),
        displacementY: new Float32Array([8]),
        magnitude: new Float32Array([8]),
        maximumDisplacementMagnitude: 10,
      },
      scalarValues: [0.8],
      expectedLine: /x1="0" y1="0" x2="0" y2="8"/,
      expectedHeatmapFill: 'fill="rgb(247 175 71)"',
    },
    {
      name: "mixed trace",
      field: {
        grid: { width: 1, height: 1 },
        direction: new Float32Array([Math.atan2(8, 6)]),
        displacementX: new Float32Array([6]),
        displacementY: new Float32Array([8]),
        magnitude: new Float32Array([10]),
        maximumDisplacementMagnitude: 10,
      },
      scalarValues: [1],
      expectedLine: /x1="0" y1="0" x2="6" y2="8"/,
      expectedHeatmapFill: 'fill="rgb(249 115 22)"',
    },
  ];

  for (const fixture of fixtures) {
    const svg = renderFieldSvg(
      createPreviewRenderField(fixture.field, fixture.scalarValues),
      {
      width: 100,
      height: 80,
      showHeatmap: true,
      vectorOverlayDensity: 16,
      },
    );

    assert.match(svg, fixture.expectedLine, fixture.name);
    assert.match(
      svg,
      new RegExp(
        fixture.expectedHeatmapFill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
      fixture.name,
    );
    assert.equal(countSvgTag(svg, "circle"), 0, fixture.name);
  }
});

function countSvgTag(svg: string, tagName: string): number {
  return svg.match(new RegExp(`<${tagName}\\b`, "g"))?.length ?? 0;
}

function createPreviewRenderField(
  vectorField: VectorField,
  scalarValues?: number[],
): {
  scalarField: ScalarField;
  vectorField: VectorField;
} {
  const sampleCount = vectorField.grid.width * vectorField.grid.height;

  return {
    scalarField: {
      grid: vectorField.grid,
      values: new Float32Array(scalarValues ?? new Array(sampleCount).fill(0)),
    },
    vectorField,
  };
}

async function postParameters(
  port: number,
  pathname: "/api/field.svg" | "/api/field.bin",
  overrides: Record<string, unknown>,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${String(port)}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(createParameterPayload(overrides)),
  });
}

function createParameterPayload(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...DEFAULT_PARAMETERS,
    ...overrides,
  };
}
