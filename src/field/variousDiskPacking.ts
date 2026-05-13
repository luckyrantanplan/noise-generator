interface Disk {
  id: number;
  x: number;
  y: number;
  r: number;
}

interface Bounds {
  width: number;
  height: number;
}

interface RandomSource {
  next(): number;
}

const MATH_RANDOM_SOURCE: RandomSource = {
  next(): number {
    return Math.random();
  },
};

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite.`);
  }
}

function assertPositiveNumber(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (value <= 0) {
    throw new RangeError(`${name} must be greater than 0.`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  assertFiniteNumber(name, value);

  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function validatePackingOptions(options: PackingOptions): void {
  assertPositiveNumber("bounds.width", options.bounds.width);
  assertPositiveNumber("bounds.height", options.bounds.height);
  assertPositiveNumber("minRadius", options.minRadius);
  assertPositiveNumber("maxRadius", options.maxRadius);
  assertNonNegativeInteger("targetCount", options.targetCount);

  if (options.minRadius > options.maxRadius) {
    throw new RangeError("minRadius must be less than or equal to maxRadius.");
  }

  if (options.maxAttempts !== undefined) {
    assertNonNegativeInteger("maxAttempts", options.maxAttempts);
  }
}

class SpatialHashGrid {
  private cellSize: number;
  private cells = new Map<string, Disk[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private key(ix: number, iy: number): string {
    return `${String(ix)},${String(iy)}`;
  }

  insert(disk: Disk): void {
    const minX = this.cellCoord(disk.x - disk.r);
    const maxX = this.cellCoord(disk.x + disk.r);

    const minY = this.cellCoord(disk.y - disk.r);
    const maxY = this.cellCoord(disk.y + disk.r);

    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const k = this.key(ix, iy);

        let bucket = this.cells.get(k);

        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }

        bucket.push(disk);
      }
    }
  }

  query(x: number, y: number, r: number): Disk[] {
    const minX = this.cellCoord(x - r);
    const maxX = this.cellCoord(x + r);

    const minY = this.cellCoord(y - r);
    const maxY = this.cellCoord(y + r);

    const result: Disk[] = [];
    const visited = new Set<number>();

    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const bucket = this.cells.get(this.key(ix, iy));

        if (!bucket) continue;

        for (const disk of bucket) {
          if (!visited.has(disk.id)) {
            visited.add(disk.id);
            result.push(disk);
          }
        }
      }
    }

    return result;
  }
}

function randomRange(min: number, max: number, random: RandomSource): number {
  return min + random.next() * (max - min);
}

function overlaps(x: number, y: number, r: number, other: Disk): boolean {
  const dx = x - other.x;
  const dy = y - other.y;

  const minDist = r + other.r;

  return dx * dx + dy * dy < minDist * minDist;
}

function insideBounds(
  x: number,
  y: number,
  r: number,
  bounds: Bounds,
): boolean {
  return (
    x - r >= 0 && y - r >= 0 && x + r <= bounds.width && y + r <= bounds.height
  );
}

export interface PackingOptions {
  bounds: Bounds;

  minRadius: number;
  maxRadius: number;

  targetCount: number;

  // Maximum candidate placements to try before stopping.
  maxAttempts?: number;

  // Optional:
  // If true, try larger disks first
  // (better global coverage)
  biasLargeDisks?: boolean;

  random?: RandomSource;
}

export function packDisks(options: PackingOptions): Disk[] {
  validatePackingOptions(options);

  const {
    bounds,
    minRadius,
    maxRadius,
    targetCount,
    maxAttempts = 50000,
    biasLargeDisks = true,
  } = options;
  const randomSource = options.random ?? MATH_RANDOM_SOURCE;

  // Good default for variable radii
  const cellSize = maxRadius * 2;

  const grid = new SpatialHashGrid(cellSize);

  const disks: Disk[] = [];

  let nextId = 0;
  let attempts = 0;

  while (disks.length < targetCount && attempts < maxAttempts) {
    attempts += 1;

    // Large-first heuristic improves filling
    const t = randomSource.next();

    let r: number;

    if (biasLargeDisks) {
      // Bias toward large radii
      // sqrt distribution
      r = minRadius + (maxRadius - minRadius) * Math.sqrt(t);
    } else {
      r = randomRange(minRadius, maxRadius, randomSource);
    }

    const x = randomRange(r, bounds.width - r, randomSource);
    const y = randomRange(r, bounds.height - r, randomSource);

    if (!insideBounds(x, y, r, bounds)) {
      continue;
    }

    const nearby = grid.query(x, y, r + maxRadius);

    let collision = false;

    for (const other of nearby) {
      if (overlaps(x, y, r, other)) {
        collision = true;
        break;
      }
    }

    if (collision) {
      continue;
    }

    const disk: Disk = {
      id: nextId++,
      x,
      y,
      r,
    };

    disks.push(disk);
    grid.insert(disk);
  }

  return disks;
}
