import test from "node:test";
import assert from "node:assert/strict";

import { packDisks } from "../src/field/variousDiskPacking.js";
import { SeededRandom } from "../src/field/hashSeed.js";

function withMockedRandom(values: number[], run: () => void): void {
  const originalRandom = Math.random;
  let index = 0;

  Math.random = () => {
    if (index >= values.length) {
      throw new Error("Unexpected Math.random call.");
    }

    const value = values[index];

    index += 1;

    return value;
  };

  try {
    run();
  } finally {
    Math.random = originalRandom;
  }
}

void test("packDisks rejects invalid radius options", () => {
  assert.throws(
    () =>
      packDisks({
        bounds: { width: 10, height: 10 },
        minRadius: 1,
        maxRadius: 0,
        targetCount: 1,
      }),
    /maxRadius must be greater than 0\./,
  );

  assert.throws(
    () =>
      packDisks({
        bounds: { width: 10, height: 10 },
        minRadius: 1,
        maxRadius: Number.POSITIVE_INFINITY,
        targetCount: 1,
      }),
    /maxRadius must be finite\./,
  );

  assert.throws(
    () =>
      packDisks({
        bounds: { width: 10, height: 10 },
        minRadius: 2,
        maxRadius: 1,
        targetCount: 1,
      }),
    /minRadius must be less than or equal to maxRadius\./,
  );
});

void test(
  "packDisks treats maxAttempts as a total candidate budget",
  { concurrency: false },
  () => {
    withMockedRandom([0, 0, 0, 0, 1, 0], () => {
      const disks = packDisks({
        bounds: { width: 10, height: 10 },
        minRadius: 1,
        maxRadius: 1,
        targetCount: 10,
        maxAttempts: 2,
      });

      assert.equal(disks.length, 2);
    });
  },
);

void test("packDisks uses a supplied random source deterministically", () => {
  const firstDisks = packDisks({
    bounds: { width: 10, height: 6 },
    minRadius: 1,
    maxRadius: 1,
    targetCount: 4,
    biasLargeDisks: false,
    random: new SeededRandom("packing-seed"),
  });
  const secondDisks = packDisks({
    bounds: { width: 10, height: 6 },
    minRadius: 1,
    maxRadius: 1,
    targetCount: 4,
    biasLargeDisks: false,
    random: new SeededRandom("packing-seed"),
  });

  assert.deepEqual(secondDisks, firstDisks);
});
