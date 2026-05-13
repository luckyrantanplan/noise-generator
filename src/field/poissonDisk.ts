import { clamp } from "../shared/params.js";
import type { GridSpec, SwirlCenter } from "../shared/types.js";
import { shortSideMetricScales } from "./grid.js";
import type { SeededRandom } from "./hashSeed.js";

interface Point {
  positionX: number;
  positionY: number;
}

interface PoissonOptions {
  grid: GridSpec;
  density: number;
  radius: number;
  strength: number;
  directionBias: number;
}

const CANDIDATE_LIMIT = 30;

export function densityToPoissonRadius(density: number): number {
  if (density <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return clamp(Math.sqrt(1 / (Math.PI * density)) * 0.9, 0.025, 1);
}

export function sampleSwirlCenters(
  options: PoissonOptions,
  random: SeededRandom,
): SwirlCenter[] {
  if (options.density <= 0 || options.strength <= 0) {
    return [];
  }

  const minimumDistance = densityToPoissonRadius(options.density);
  const points = samplePoissonDisk(minimumDistance, options.grid, random);
  return points.map((point) => {
    const direction = random.next() < options.directionBias ? 1 : -1;
    return {
      positionX: point.positionX,
      positionY: point.positionY,
      radius: options.radius,
      direction,
    };
  });
}

function samplePoissonDisk(
  minimumDistance: number,
  grid: GridSpec,
  random: SeededRandom,
): Point[] {
  const metricScales = shortSideMetricScales(grid);
  const cellWidth = minimumDistance / Math.SQRT2 / metricScales.xScale;
  const cellHeight = minimumDistance / Math.SQRT2 / metricScales.yScale;
  const gridWidth = Math.max(1, Math.ceil(1 / cellWidth));
  const gridHeight = Math.max(1, Math.ceil(1 / cellHeight));
  const occupancy = new Int32Array(gridWidth * gridHeight).fill(-1);
  const points: Point[] = [];
  const activePoints: Point[] = [];

  const initialPoint = { positionX: random.next(), positionY: random.next() };
  addPoint(
    initialPoint,
    points,
    activePoints,
    occupancy,
    gridWidth,
    cellWidth,
    cellHeight,
  );

  while (activePoints.length > 0) {
    const activeIndex = random.integer(0, activePoints.length - 1);
    const activePoint = activePoints[activeIndex];
    let acceptedCandidate = false;

    for (
      let attemptIndex = 0;
      attemptIndex < CANDIDATE_LIMIT;
      attemptIndex += 1
    ) {
      const candidate = createCandidate(
        activePoint,
        minimumDistance,
        metricScales,
        random,
      );
      if (
        isCandidateValid(
          candidate,
          minimumDistance,
          metricScales,
          points,
          occupancy,
          gridWidth,
          gridHeight,
          cellWidth,
          cellHeight,
        )
      ) {
        addPoint(
          candidate,
          points,
          activePoints,
          occupancy,
          gridWidth,
          cellWidth,
          cellHeight,
        );
        acceptedCandidate = true;
        break;
      }
    }

    if (!acceptedCandidate) {
      activePoints.splice(activeIndex, 1);
    }
  }

  return points;
}

function createCandidate(
  activePoint: Point,
  minimumDistance: number,
  metricScales: { xScale: number; yScale: number },
  random: SeededRandom,
): Point {
  const angle = random.between(0, Math.PI * 2);
  const distance = random.between(minimumDistance, minimumDistance * 2);
  return {
    positionX:
      activePoint.positionX +
      (Math.cos(angle) * distance) / metricScales.xScale,
    positionY:
      activePoint.positionY +
      (Math.sin(angle) * distance) / metricScales.yScale,
  };
}

function isCandidateValid(
  candidate: Point,
  minimumDistance: number,
  metricScales: { xScale: number; yScale: number },
  points: Point[],
  occupancy: Int32Array,
  gridWidth: number,
  gridHeight: number,
  cellWidth: number,
  cellHeight: number,
): boolean {
  if (
    candidate.positionX < 0 ||
    candidate.positionX > 1 ||
    candidate.positionY < 0 ||
    candidate.positionY > 1
  ) {
    return false;
  }

  const gridColumn = Math.floor(candidate.positionX / cellWidth);
  const gridRow = Math.floor(candidate.positionY / cellHeight);
  const minimumDistanceSquared = minimumDistance * minimumDistance;

  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      const neighborColumn = gridColumn + columnOffset;
      const neighborRow = gridRow + rowOffset;
      if (
        neighborColumn < 0 ||
        neighborColumn >= gridWidth ||
        neighborRow < 0 ||
        neighborRow >= gridHeight
      ) {
        continue;
      }
      const pointIndex = occupancy[neighborRow * gridWidth + neighborColumn];
      if (pointIndex < 0) {
        continue;
      }
      const neighborPoint = points[pointIndex];
      const deltaX =
        (candidate.positionX - neighborPoint.positionX) * metricScales.xScale;
      const deltaY =
        (candidate.positionY - neighborPoint.positionY) * metricScales.yScale;
      if (deltaX * deltaX + deltaY * deltaY < minimumDistanceSquared) {
        return false;
      }
    }
  }

  return true;
}

function addPoint(
  point: Point,
  points: Point[],
  activePoints: Point[],
  occupancy: Int32Array,
  gridWidth: number,
  cellWidth: number,
  cellHeight: number,
): void {
  const pointIndex = points.length;
  points.push(point);
  activePoints.push(point);
  const gridColumn = Math.floor(point.positionX / cellWidth);
  const gridRow = Math.floor(point.positionY / cellHeight);
  occupancy[gridRow * gridWidth + gridColumn] = pointIndex;
}
