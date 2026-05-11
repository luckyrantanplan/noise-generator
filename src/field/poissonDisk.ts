import { clamp } from "../shared/params.js";
import type { SwirlCenter } from "../shared/types.js";
import type { SeededRandom } from "./rng.js";

interface Point {
  positionX: number;
  positionY: number;
}

interface PoissonOptions {
  density: number;
  radius: number;
  strength: number;
  directionRandomness: number;
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
  const points = samplePoissonDisk(minimumDistance, random);
  return points.map((point, pointIndex) => {
    const randomSign = random.next() < 0.5 ? -1 : 1;
    const direction =
      random.next() < options.directionRandomness
        ? randomSign
        : alternatingDirection(pointIndex);
    return {
      positionX: point.positionX,
      positionY: point.positionY,
      radius: options.radius,
      direction,
      phase: random.between(0, Math.PI * 2) * options.directionRandomness,
    };
  });
}

function samplePoissonDisk(
  minimumDistance: number,
  random: SeededRandom,
): Point[] {
  const cellSize = minimumDistance / Math.SQRT2;
  const gridWidth = Math.max(1, Math.ceil(1 / cellSize));
  const gridHeight = Math.max(1, Math.ceil(1 / cellSize));
  const occupancy = new Int32Array(gridWidth * gridHeight).fill(-1);
  const points: Point[] = [];
  const activePoints: Point[] = [];

  const initialPoint = { positionX: random.next(), positionY: random.next() };
  addPoint(initialPoint, points, activePoints, occupancy, gridWidth, cellSize);

  while (activePoints.length > 0) {
    const activeIndex = random.integer(0, activePoints.length - 1);
    const activePoint = activePoints[activeIndex];
    let acceptedCandidate = false;

    for (
      let attemptIndex = 0;
      attemptIndex < CANDIDATE_LIMIT;
      attemptIndex += 1
    ) {
      const candidate = createCandidate(activePoint, minimumDistance, random);
      if (
        isCandidateValid(
          candidate,
          minimumDistance,
          points,
          occupancy,
          gridWidth,
          gridHeight,
          cellSize,
        )
      ) {
        addPoint(
          candidate,
          points,
          activePoints,
          occupancy,
          gridWidth,
          cellSize,
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
  random: SeededRandom,
): Point {
  const angle = random.between(0, Math.PI * 2);
  const distance = random.between(minimumDistance, minimumDistance * 2);
  return {
    positionX: activePoint.positionX + Math.cos(angle) * distance,
    positionY: activePoint.positionY + Math.sin(angle) * distance,
  };
}

function isCandidateValid(
  candidate: Point,
  minimumDistance: number,
  points: Point[],
  occupancy: Int32Array,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
): boolean {
  if (
    candidate.positionX < 0 ||
    candidate.positionX > 1 ||
    candidate.positionY < 0 ||
    candidate.positionY > 1
  ) {
    return false;
  }

  const gridColumn = Math.floor(candidate.positionX / cellSize);
  const gridRow = Math.floor(candidate.positionY / cellSize);
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
      const deltaX = candidate.positionX - neighborPoint.positionX;
      const deltaY = candidate.positionY - neighborPoint.positionY;
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
  cellSize: number,
): void {
  const pointIndex = points.length;
  points.push(point);
  activePoints.push(point);
  const gridColumn = Math.floor(point.positionX / cellSize);
  const gridRow = Math.floor(point.positionY / cellSize);
  occupancy[gridRow * gridWidth + gridColumn] = pointIndex;
}

function alternatingDirection(pointIndex: number): -1 | 1 {
  return pointIndex % 2 === 0 ? 1 : -1;
}
