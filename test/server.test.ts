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

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(svg, /^<svg/);
    assert.match(svg, /<line/);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});
