import type { GridSpec, ScalarField } from "../shared/types.js";
import {
  estimateGradient,
  gridStepSize,
  locateCell,
  normalizedPointForNode,
  sampleNodeValue,
  sampleScalar,
  type NormalizedPoint,
} from "./scalarSampling.js";

const EPSILON = 1e-6;
const ROOT_EPSILON = 1e-5;
const PATCH_TRACE_MAX_SUBSTEPS = 48;
const PATCH_TRACE_STEP_RATIO = 0.18;
const CONTOUR_PROJECTION_ITERATIONS = 6;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface TraceOptions {
  renderWidth: number;
  renderHeight: number;
  targetTurnAngleDegrees: number;
  maxTraceLength: number;
  maxSteps?: number;
}

export type TraceTerminationReason =
  | "angle-limit"
  | "length-limit"
  | "boundary"
  | "degenerate"
  | "loop-limit";

export interface IsolineTrace {
  path: WorldPoint[];
  terminationReason: TraceTerminationReason;
}

interface TraceStepResult {
  points: WorldPoint[];
  terminationReason: TraceTerminationReason | null;
}

interface WorldVector {
  x: number;
  y: number;
}

interface CellEdgeCrossing {
  point: NormalizedPoint;
}

interface BicubicPatch {
  matrix: number[][];
  minimumWorldX: number;
  minimumWorldY: number;
  maximumWorldX: number;
  maximumWorldY: number;
  cellWidthWorld: number;
  cellHeightWorld: number;
}

interface PatchSample {
  value: number;
  gradientWorld: WorldVector;
}

export function traceIsolineFromPoint(
  field: ScalarField,
  startPoint: WorldPoint,
  options: TraceOptions,
): IsolineTrace {
  const path: WorldPoint[] = [startPoint];
  if (field.grid.width < 2 || field.grid.height < 2) {
    return {
      path,
      terminationReason: "degenerate",
    };
  }

  if (options.maxTraceLength <= EPSILON) {
    return {
      path,
      terminationReason: "length-limit",
    };
  }

  if (options.targetTurnAngleDegrees <= EPSILON) {
    return {
      path,
      terminationReason: "angle-limit",
    };
  }

  const startNormalized = worldToNormalized(startPoint, options);
  const contourLevel = sampleScalar(
    field,
    startNormalized.x,
    startNormalized.y,
  );
  const initialTangent = getIsolineTangentAt(field, startPoint, options);
  if (initialTangent === null) {
    return {
      path,
      terminationReason: "degenerate",
    };
  }

  const alignedInitialTangent = initialTangent;
  const initialAngle = Math.atan2(
    alignedInitialTangent.y,
    alignedInitialTangent.x,
  );
  const maximumStepCount =
    options.maxSteps ?? Math.max(32, field.grid.width * field.grid.height * 4);
  const closeLoopDistance =
    Math.min(
      options.renderWidth / Math.max(1, field.grid.width - 1),
      options.renderHeight / Math.max(1, field.grid.height - 1),
    ) * 0.35;

  let currentPoint = startPoint;
  let currentHeading = alignedInitialTangent;
  let cumulativeLength = 0;
  let lastAngle = initialAngle;
  let unwrappedAngle = initialAngle;

  for (let stepIndex = 0; stepIndex < maximumStepCount; stepIndex += 1) {
    const nextStep = traceContourThroughCurrentCell(
      field,
      currentPoint,
      currentHeading,
      contourLevel,
      options,
    );
    if (nextStep.points.length === 0) {
      return {
        path,
        terminationReason: nextStep.terminationReason ?? "degenerate",
      };
    }

    for (const nextPoint of nextStep.points) {
      const stepVector = subtractPoint(nextPoint, currentPoint);
      const stepLength = vectorLength(stepVector);
      if (stepLength <= EPSILON) {
        continue;
      }

      const stepAngle = Math.atan2(stepVector.y, stepVector.x);
      const deltaAngle = unwrapAngle(stepAngle - lastAngle);
      const nextUnwrappedAngle = unwrappedAngle + deltaAngle;
      const potentialLength = cumulativeLength + stepLength;
      const potentialAngle = Math.abs(nextUnwrappedAngle - initialAngle);

      if (potentialLength >= options.maxTraceLength) {
        const remainingLength = options.maxTraceLength - cumulativeLength;
        const ratio = Math.max(0, Math.min(1, remainingLength / stepLength));
        path.push({
          x: currentPoint.x + stepVector.x * ratio,
          y: currentPoint.y + stepVector.y * ratio,
        });
        return {
          path,
          terminationReason: "length-limit",
        };
      }

      path.push(nextPoint);

      if (potentialAngle >= degreesToRadians(options.targetTurnAngleDegrees)) {
        return {
          path,
          terminationReason: "angle-limit",
        };
      }

      if (
        path.length >= 4 &&
        distanceBetweenPoints(nextPoint, path[0]) <= closeLoopDistance
      ) {
        return {
          path,
          terminationReason: "loop-limit",
        };
      }

      cumulativeLength = potentialLength;
      lastAngle = stepAngle;
      unwrappedAngle = nextUnwrappedAngle;
      currentHeading = normalizeVector(stepVector);
      currentPoint = nextPoint;
    }

    if (nextStep.terminationReason !== null) {
      return {
        path,
        terminationReason: nextStep.terminationReason,
      };
    }
  }

  return {
    path,
    terminationReason: "loop-limit",
  };
}

function getIsolineTangentAt(
  field: ScalarField,
  point: WorldPoint,
  options: TraceOptions,
): WorldVector | null {
  const normalizedPoint = worldToNormalized(point, options);
  const cell = locateCell(field.grid, normalizedPoint.x, normalizedPoint.y);
  if (cell !== null) {
    const patch = createBicubicPatch(
      field,
      cell.columnIndex,
      cell.rowIndex,
      options,
    );
    const patchSample = evaluatePatchAtWorld(patch, point);
    if (
      patchSample !== null &&
      vectorLength(patchSample.gradientWorld) > EPSILON
    ) {
      return normalizeVector(
        tangentFromGradientWorld(patchSample.gradientWorld),
      );
    }
  }

  const gradient = estimateGradient(
    field,
    normalizedPoint.x,
    normalizedPoint.y,
  );
  const worldGradient = {
    x: gradient.x / Math.max(options.renderWidth, EPSILON),
    y: gradient.y / Math.max(options.renderHeight, EPSILON),
  };
  const tangent = tangentFromGradientWorld(worldGradient);
  if (vectorLength(tangent) <= EPSILON) {
    return null;
  }

  return normalizeVector(tangent);
}

function traceContourThroughCurrentCell(
  field: ScalarField,
  currentPoint: WorldPoint,
  currentHeading: WorldVector,
  contourLevel: number,
  options: TraceOptions,
): TraceStepResult {
  const probeDistance = resolveProbeDistance(field.grid, options);
  const probePoint = {
    x: currentPoint.x + currentHeading.x * probeDistance,
    y: currentPoint.y + currentHeading.y * probeDistance,
  };
  const probeNormalized = worldToNormalized(probePoint, options);
  if (!isPointInsideUnitSquare(probeNormalized)) {
    return {
      points: [],
      terminationReason: "boundary",
    };
  }

  const cell = locateCell(field.grid, probeNormalized.x, probeNormalized.y);
  if (cell === null) {
    return {
      points: [],
      terminationReason: "degenerate",
    };
  }

  const patch = createBicubicPatch(
    field,
    cell.columnIndex,
    cell.rowIndex,
    options,
  );
  const crossings = collectCellEdgeCrossings(
    field,
    cell.columnIndex,
    cell.rowIndex,
    contourLevel,
  );
  const currentNormalized = worldToNormalized(currentPoint, options);
  const candidateCrossings = crossings.filter((crossing) => {
    return (
      distanceBetweenPoints(crossing.point, currentNormalized) > ROOT_EPSILON
    );
  });
  if (candidateCrossings.length === 0) {
    return {
      points: [],
      terminationReason: "boundary",
    };
  }

  const nextCrossing = chooseForwardCrossing(
    candidateCrossings,
    currentPoint,
    currentHeading,
    options,
  );
  if (nextCrossing === null) {
    return {
      points: [],
      terminationReason: "boundary",
    };
  }

  const exitPoint = normalizedToWorld(nextCrossing.point, options);
  const tracedPoints = traceContourInsideCell(
    patch,
    currentPoint,
    exitPoint,
    currentHeading,
    contourLevel,
  );

  return {
    points: tracedPoints,
    terminationReason: null,
  };
}

function traceContourInsideCell(
  patch: BicubicPatch,
  startPoint: WorldPoint,
  exitPoint: WorldPoint,
  headingHint: WorldVector,
  contourLevel: number,
): WorldPoint[] {
  if (distanceBetweenPoints(startPoint, exitPoint) <= ROOT_EPSILON) {
    return [exitPoint];
  }

  const tracedPoints: WorldPoint[] = [];
  const nominalStep =
    Math.min(patch.cellWidthWorld, patch.cellHeightWorld) *
    PATCH_TRACE_STEP_RATIO;
  let currentPoint = startPoint;
  let currentHeading = headingHint;

  for (
    let substepIndex = 0;
    substepIndex < PATCH_TRACE_MAX_SUBSTEPS;
    substepIndex += 1
  ) {
    const remainingDistance = distanceBetweenPoints(currentPoint, exitPoint);
    if (remainingDistance <= Math.max(nominalStep * 0.75, ROOT_EPSILON)) {
      tracedPoints.push(exitPoint);
      return dedupeTrailingPoint(tracedPoints);
    }

    const patchSample = evaluatePatchAtWorld(patch, currentPoint);
    if (
      patchSample === null ||
      vectorLength(patchSample.gradientWorld) <= EPSILON
    ) {
      tracedPoints.push(exitPoint);
      return dedupeTrailingPoint(tracedPoints);
    }

    let tangent = tangentFromGradientWorld(patchSample.gradientWorld);
    tangent = orientTangentTowardProgress(
      tangent,
      currentHeading,
      subtractPoint(exitPoint, currentPoint),
    );
    const stepDistance = Math.min(nominalStep, remainingDistance * 0.6);
    const predictedPoint = {
      x: currentPoint.x + tangent.x * stepDistance,
      y: currentPoint.y + tangent.y * stepDistance,
    };
    const correctedPoint = projectPointOntoContour(
      patch,
      predictedPoint,
      contourLevel,
    );
    if (correctedPoint === null) {
      tracedPoints.push(exitPoint);
      return dedupeTrailingPoint(tracedPoints);
    }

    if (!isPointInsidePatch(correctedPoint, patch, stepDistance * 0.5)) {
      tracedPoints.push(exitPoint);
      return dedupeTrailingPoint(tracedPoints);
    }

    const advance = subtractPoint(correctedPoint, currentPoint);
    if (vectorLength(advance) <= ROOT_EPSILON) {
      tracedPoints.push(exitPoint);
      return dedupeTrailingPoint(tracedPoints);
    }

    tracedPoints.push(correctedPoint);
    currentHeading = normalizeVector(advance);
    currentPoint = correctedPoint;
  }

  tracedPoints.push(exitPoint);
  return dedupeTrailingPoint(tracedPoints);
}

function collectCellEdgeCrossings(
  field: ScalarField,
  columnIndex: number,
  rowIndex: number,
  contourLevel: number,
): CellEdgeCrossing[] {
  const crossings: CellEdgeCrossing[] = [];

  addCrossingIfPresent(
    crossings,
    solveHorizontalEdgeCrossing(field, columnIndex, rowIndex, contourLevel),
  );
  addCrossingIfPresent(
    crossings,
    solveVerticalEdgeCrossing(field, columnIndex + 1, rowIndex, contourLevel),
  );
  addCrossingIfPresent(
    crossings,
    solveHorizontalEdgeCrossing(field, columnIndex, rowIndex + 1, contourLevel),
  );
  addCrossingIfPresent(
    crossings,
    solveVerticalEdgeCrossing(field, columnIndex, rowIndex, contourLevel),
  );

  return crossings;
}

function solveHorizontalEdgeCrossing(
  field: ScalarField,
  startColumnIndex: number,
  rowIndex: number,
  contourLevel: number,
): NormalizedPoint | null {
  const startValue = sampleNodeValue(field, startColumnIndex, rowIndex);
  const endValue = sampleNodeValue(field, startColumnIndex + 1, rowIndex);
  if (!edgeCanCross(contourLevel, startValue, endValue)) {
    return null;
  }

  const startSlope = estimateHorizontalSlope(field, startColumnIndex, rowIndex);
  const endSlope = estimateHorizontalSlope(
    field,
    startColumnIndex + 1,
    rowIndex,
  );
  const crossingRatio = solveHermiteRoot(
    startValue,
    endValue,
    startSlope,
    endSlope,
    contourLevel,
  );
  if (crossingRatio === null) {
    return null;
  }

  const startPoint = normalizedPointForNode(
    field.grid,
    startColumnIndex,
    rowIndex,
  );
  const endPoint = normalizedPointForNode(
    field.grid,
    startColumnIndex + 1,
    rowIndex,
  );

  return {
    x: interpolateLinear(startPoint.x, endPoint.x, crossingRatio),
    y: startPoint.y,
  };
}

function solveVerticalEdgeCrossing(
  field: ScalarField,
  columnIndex: number,
  startRowIndex: number,
  contourLevel: number,
): NormalizedPoint | null {
  const startValue = sampleNodeValue(field, columnIndex, startRowIndex);
  const endValue = sampleNodeValue(field, columnIndex, startRowIndex + 1);
  if (!edgeCanCross(contourLevel, startValue, endValue)) {
    return null;
  }

  const startSlope = estimateVerticalSlope(field, columnIndex, startRowIndex);
  const endSlope = estimateVerticalSlope(field, columnIndex, startRowIndex + 1);
  const crossingRatio = solveHermiteRoot(
    startValue,
    endValue,
    startSlope,
    endSlope,
    contourLevel,
  );
  if (crossingRatio === null) {
    return null;
  }

  const startPoint = normalizedPointForNode(
    field.grid,
    columnIndex,
    startRowIndex,
  );
  const endPoint = normalizedPointForNode(
    field.grid,
    columnIndex,
    startRowIndex + 1,
  );

  return {
    x: startPoint.x,
    y: interpolateLinear(startPoint.y, endPoint.y, crossingRatio),
  };
}

function chooseForwardCrossing(
  crossings: CellEdgeCrossing[],
  currentPoint: WorldPoint,
  currentHeading: WorldVector,
  options: TraceOptions,
): CellEdgeCrossing | null {
  let bestCrossing: CellEdgeCrossing | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const crossing of crossings) {
    const crossingWorld = normalizedToWorld(crossing.point, options);
    const offset = subtractPoint(crossingWorld, currentPoint);
    const distance = vectorLength(offset);
    if (distance <= EPSILON) {
      continue;
    }

    const direction = normalizeVector(offset);
    const score = dotProduct(direction, currentHeading);
    if (
      score > bestScore + EPSILON ||
      (Math.abs(score - bestScore) <= EPSILON && distance < bestDistance)
    ) {
      bestCrossing = crossing;
      bestScore = score;
      bestDistance = distance;
    }
  }

  return bestCrossing;
}

function createBicubicPatch(
  field: ScalarField,
  columnIndex: number,
  rowIndex: number,
  options: TraceOptions,
): BicubicPatch {
  const topLeft = normalizedPointForNode(field.grid, columnIndex, rowIndex);
  const topRight = normalizedPointForNode(
    field.grid,
    columnIndex + 1,
    rowIndex,
  );
  const bottomLeft = normalizedPointForNode(
    field.grid,
    columnIndex,
    rowIndex + 1,
  );

  const matrix = [
    [
      sampleNodeValue(field, columnIndex, rowIndex),
      sampleNodeValue(field, columnIndex, rowIndex + 1),
      estimateVerticalSlope(field, columnIndex, rowIndex),
      estimateVerticalSlope(field, columnIndex, rowIndex + 1),
    ],
    [
      sampleNodeValue(field, columnIndex + 1, rowIndex),
      sampleNodeValue(field, columnIndex + 1, rowIndex + 1),
      estimateVerticalSlope(field, columnIndex + 1, rowIndex),
      estimateVerticalSlope(field, columnIndex + 1, rowIndex + 1),
    ],
    [
      estimateHorizontalSlope(field, columnIndex, rowIndex),
      estimateHorizontalSlope(field, columnIndex, rowIndex + 1),
      estimateMixedSlope(field, columnIndex, rowIndex),
      estimateMixedSlope(field, columnIndex, rowIndex + 1),
    ],
    [
      estimateHorizontalSlope(field, columnIndex + 1, rowIndex),
      estimateHorizontalSlope(field, columnIndex + 1, rowIndex + 1),
      estimateMixedSlope(field, columnIndex + 1, rowIndex),
      estimateMixedSlope(field, columnIndex + 1, rowIndex + 1),
    ],
  ];

  return {
    matrix,
    minimumWorldX: topLeft.x * options.renderWidth,
    minimumWorldY: topLeft.y * options.renderHeight,
    maximumWorldX: topRight.x * options.renderWidth,
    maximumWorldY: bottomLeft.y * options.renderHeight,
    cellWidthWorld: (topRight.x - topLeft.x) * options.renderWidth,
    cellHeightWorld: (bottomLeft.y - topLeft.y) * options.renderHeight,
  };
}

function evaluatePatchAtWorld(
  patch: BicubicPatch,
  point: WorldPoint,
): PatchSample | null {
  const localPoint = worldPointToPatchLocal(patch, point);
  if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
    return null;
  }

  const basisX = hermiteBasis(localPoint.x);
  const basisY = hermiteBasis(localPoint.y);
  const derivativeBasisX = hermiteBasisDerivative(localPoint.x);
  const derivativeBasisY = hermiteBasisDerivative(localPoint.y);

  let value = 0;
  let derivativeLocalX = 0;
  let derivativeLocalY = 0;

  for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < 4; columnIndex += 1) {
      const coefficient = patch.matrix[rowIndex][columnIndex];
      value += basisX[rowIndex] * basisY[columnIndex] * coefficient;
      derivativeLocalX +=
        derivativeBasisX[rowIndex] * basisY[columnIndex] * coefficient;
      derivativeLocalY +=
        basisX[rowIndex] * derivativeBasisY[columnIndex] * coefficient;
    }
  }

  return {
    value,
    gradientWorld: {
      x: derivativeLocalX / Math.max(patch.cellWidthWorld, EPSILON),
      y: derivativeLocalY / Math.max(patch.cellHeightWorld, EPSILON),
    },
  };
}

function projectPointOntoContour(
  patch: BicubicPatch,
  point: WorldPoint,
  contourLevel: number,
): WorldPoint | null {
  let projectedPoint = point;

  for (
    let iterationIndex = 0;
    iterationIndex < CONTOUR_PROJECTION_ITERATIONS;
    iterationIndex += 1
  ) {
    const sample = evaluatePatchAtWorld(patch, projectedPoint);
    if (sample === null) {
      return null;
    }

    const residual = sample.value - contourLevel;
    if (Math.abs(residual) <= ROOT_EPSILON) {
      return projectedPoint;
    }

    const gradientLengthSquared =
      sample.gradientWorld.x * sample.gradientWorld.x +
      sample.gradientWorld.y * sample.gradientWorld.y;
    if (gradientLengthSquared <= EPSILON) {
      return null;
    }

    projectedPoint = {
      x:
        projectedPoint.x -
        (residual / gradientLengthSquared) * sample.gradientWorld.x,
      y:
        projectedPoint.y -
        (residual / gradientLengthSquared) * sample.gradientWorld.y,
    };
  }

  return projectedPoint;
}

function addCrossingIfPresent(
  crossings: CellEdgeCrossing[],
  point: NormalizedPoint | null,
): void {
  if (point === null) {
    return;
  }

  for (const existingCrossing of crossings) {
    if (distanceBetweenPoints(existingCrossing.point, point) <= ROOT_EPSILON) {
      return;
    }
  }

  crossings.push({ point });
}

function estimateHorizontalSlope(
  field: ScalarField,
  columnIndex: number,
  rowIndex: number,
): number {
  const previousValue = sampleNodeValue(field, columnIndex - 1, rowIndex);
  const nextValue = sampleNodeValue(field, columnIndex + 1, rowIndex);
  return (nextValue - previousValue) * 0.5;
}

function estimateVerticalSlope(
  field: ScalarField,
  columnIndex: number,
  rowIndex: number,
): number {
  const previousValue = sampleNodeValue(field, columnIndex, rowIndex - 1);
  const nextValue = sampleNodeValue(field, columnIndex, rowIndex + 1);
  return (nextValue - previousValue) * 0.5;
}

function estimateMixedSlope(
  field: ScalarField,
  columnIndex: number,
  rowIndex: number,
): number {
  return (
    (sampleNodeValue(field, columnIndex + 1, rowIndex + 1) -
      sampleNodeValue(field, columnIndex + 1, rowIndex - 1) -
      sampleNodeValue(field, columnIndex - 1, rowIndex + 1) +
      sampleNodeValue(field, columnIndex - 1, rowIndex - 1)) *
    0.25
  );
}

function solveHermiteRoot(
  startValue: number,
  endValue: number,
  startSlope: number,
  endSlope: number,
  contourLevel: number,
): number | null {
  const startDelta = startValue - contourLevel;
  const endDelta = endValue - contourLevel;

  if (
    Math.abs(startDelta) <= ROOT_EPSILON &&
    Math.abs(endDelta) <= ROOT_EPSILON
  ) {
    return null;
  }
  if (Math.abs(startDelta) <= ROOT_EPSILON) {
    return 0;
  }
  if (Math.abs(endDelta) <= ROOT_EPSILON) {
    return 1;
  }
  if (startDelta * endDelta > 0) {
    return null;
  }

  let left = 0;
  let right = 1;
  let leftValue = startDelta;

  for (let iterationIndex = 0; iterationIndex < 28; iterationIndex += 1) {
    const midpoint = (left + right) * 0.5;
    const midpointValue =
      cubicHermiteValue(startValue, endValue, startSlope, endSlope, midpoint) -
      contourLevel;
    if (Math.abs(midpointValue) <= ROOT_EPSILON) {
      return midpoint;
    }

    if (leftValue * midpointValue <= 0) {
      right = midpoint;
      continue;
    }

    left = midpoint;
    leftValue = midpointValue;
  }

  return (left + right) * 0.5;
}

function cubicHermiteValue(
  startValue: number,
  endValue: number,
  startSlope: number,
  endSlope: number,
  ratio: number,
): number {
  const ratioSquared = ratio * ratio;
  const ratioCubed = ratioSquared * ratio;

  return (
    (2 * ratioCubed - 3 * ratioSquared + 1) * startValue +
    (ratioCubed - 2 * ratioSquared + ratio) * startSlope +
    (-2 * ratioCubed + 3 * ratioSquared) * endValue +
    (ratioCubed - ratioSquared) * endSlope
  );
}

function edgeCanCross(
  contourLevel: number,
  startValue: number,
  endValue: number,
): boolean {
  const startDelta = startValue - contourLevel;
  const endDelta = endValue - contourLevel;
  if (
    Math.abs(startDelta) <= ROOT_EPSILON ||
    Math.abs(endDelta) <= ROOT_EPSILON
  ) {
    return true;
  }
  return startDelta * endDelta < 0;
}

function resolveProbeDistance(grid: GridSpec, options: TraceOptions): number {
  const steps = gridStepSize(grid);
  const worldStepX = steps.xStep * options.renderWidth;
  const worldStepY = steps.yStep * options.renderHeight;
  return Math.max(0.25, Math.min(worldStepX, worldStepY) * 0.05);
}

function worldToNormalized(
  point: WorldPoint,
  options: TraceOptions,
): NormalizedPoint {
  return {
    x: point.x / Math.max(options.renderWidth, EPSILON),
    y: point.y / Math.max(options.renderHeight, EPSILON),
  };
}

function normalizedToWorld(
  point: NormalizedPoint,
  options: TraceOptions,
): WorldPoint {
  return {
    x: point.x * options.renderWidth,
    y: point.y * options.renderHeight,
  };
}

function worldPointToPatchLocal(
  patch: BicubicPatch,
  point: WorldPoint,
): NormalizedPoint {
  return {
    x:
      (point.x - patch.minimumWorldX) / Math.max(patch.cellWidthWorld, EPSILON),
    y:
      (point.y - patch.minimumWorldY) /
      Math.max(patch.cellHeightWorld, EPSILON),
  };
}

function isPointInsidePatch(
  point: WorldPoint,
  patch: BicubicPatch,
  tolerance: number,
): boolean {
  return (
    point.x >= patch.minimumWorldX - tolerance &&
    point.x <= patch.maximumWorldX + tolerance &&
    point.y >= patch.minimumWorldY - tolerance &&
    point.y <= patch.maximumWorldY + tolerance
  );
}

function tangentFromGradientWorld(gradient: WorldVector): WorldVector {
  return {
    x: -gradient.y,
    y: gradient.x,
  };
}

function orientTangentTowardProgress(
  tangent: WorldVector,
  headingHint: WorldVector,
  targetVector: WorldVector,
): WorldVector {
  const normalizedTangent = normalizeVector(tangent);
  const normalizedHeadingHint = normalizeVector(headingHint);
  const normalizedTarget = normalizeVector(targetVector);
  const positive = normalizedTangent;
  const negative = { x: -normalizedTangent.x, y: -normalizedTangent.y };
  const positiveScore =
    dotProduct(positive, normalizedHeadingHint) +
    0.5 * dotProduct(positive, normalizedTarget);
  const negativeScore =
    dotProduct(negative, normalizedHeadingHint) +
    0.5 * dotProduct(negative, normalizedTarget);

  return negativeScore > positiveScore ? negative : positive;
}

function normalizeVector(vector: WorldVector): WorldVector {
  const length = vectorLength(vector);
  if (length <= EPSILON) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function subtractPoint(
  endPoint: WorldPoint,
  startPoint: WorldPoint,
): WorldVector {
  return {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y,
  };
}

function vectorLength(vector: WorldVector): number {
  return Math.hypot(vector.x, vector.y);
}

function dotProduct(left: WorldVector, right: WorldVector): number {
  return left.x * right.x + left.y * right.y;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function unwrapAngle(value: number): number {
  return value - Math.PI * 2 * Math.round(value / (Math.PI * 2));
}

function interpolateLinear(
  startValue: number,
  endValue: number,
  ratio: number,
): number {
  return startValue + (endValue - startValue) * ratio;
}

function distanceBetweenPoints(
  left: WorldPoint | NormalizedPoint,
  right: WorldPoint | NormalizedPoint,
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function hermiteBasis(ratio: number): number[] {
  const ratioSquared = ratio * ratio;
  const ratioCubed = ratioSquared * ratio;

  return [
    2 * ratioCubed - 3 * ratioSquared + 1,
    -2 * ratioCubed + 3 * ratioSquared,
    ratioCubed - 2 * ratioSquared + ratio,
    ratioCubed - ratioSquared,
  ];
}

function hermiteBasisDerivative(ratio: number): number[] {
  const ratioSquared = ratio * ratio;

  return [
    6 * ratioSquared - 6 * ratio,
    -6 * ratioSquared + 6 * ratio,
    3 * ratioSquared - 4 * ratio + 1,
    3 * ratioSquared - 2 * ratio,
  ];
}

function dedupeTrailingPoint(points: WorldPoint[]): WorldPoint[] {
  if (points.length < 2) {
    return points;
  }

  const deduped = [...points];
  while (
    deduped.length >= 2 &&
    distanceBetweenPoints(
      deduped[deduped.length - 1],
      deduped[deduped.length - 2],
    ) <= ROOT_EPSILON
  ) {
    deduped.splice(deduped.length - 2, 1);
  }

  return deduped;
}

function isPointInsideUnitSquare(point: NormalizedPoint): boolean {
  return (
    point.x >= -ROOT_EPSILON &&
    point.x <= 1 + ROOT_EPSILON &&
    point.y >= -ROOT_EPSILON &&
    point.y <= 1 + ROOT_EPSILON
  );
}
