import type { ParameterValues } from "./types.js";

const CENTER_DEAD_ZONE_RADIUS = 0.02;
const CENTER_FULL_STRENGTH_RADIUS = 0.06;
const EDGE_TRANSITION_START = 0.9;
const DEGREES_TO_RADIANS = Math.PI / 180;
const SWIRL_MAX_SAMPLES = 2048;

const MAX_SWIRL_ANGLE_DEGREES = 1440;
const MIN_SWIRL_RADIUS_RATIO = 0.03;

export function swirlAngleEnvelope(
  normalizedDistance: number,
  swirlFalloff: number,
): number {
  const innerGain = smoothstep(
    CENTER_DEAD_ZONE_RADIUS,
    CENTER_FULL_STRENGTH_RADIUS,
    normalizedDistance,
  );
  const edgeBase = 1 - smoothstep(EDGE_TRANSITION_START, 1, normalizedDistance);
  return innerGain * Math.pow(Math.max(0, edgeBase), swirlFalloff);
}

export function maxSwirlChordLength(
  radius: number,
  strengthDegrees: number,
  swirlFalloff: number,
): number {
  if (radius <= 0 || strengthDegrees <= 0) {
    return 0;
  }

  let maximumChord = 0;

  for (
    let sampleIndex = 0;
    sampleIndex <= SWIRL_MAX_SAMPLES;
    sampleIndex += 1
  ) {
    const normalizedDistance = sampleIndex / SWIRL_MAX_SAMPLES;
    const envelope = swirlAngleEnvelope(normalizedDistance, swirlFalloff);
    const angle = strengthDegrees * DEGREES_TO_RADIANS * envelope;
    const chordLength =
      2 * normalizedDistance * radius * Math.abs(Math.sin(angle / 2));

    if (chordLength > maximumChord) {
      maximumChord = chordLength;
    }
  }

  return maximumChord;
}

export function clampSwirlStrengthToForce(
  requestedStrengthDegrees: number,
  force: number,
  radius: number,
  swirlFalloff: number,
): number {
  if (requestedStrengthDegrees <= 0 || force <= 0) {
    return 0;
  }

  if (radius <= 0) {
    return 0;
  }

  if (
    maxSwirlChordLength(radius, requestedStrengthDegrees, swirlFalloff) <= force
  ) {
    return requestedStrengthDegrees;
  }

  let lowerBound = 0;
  let upperBound = requestedStrengthDegrees;

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const midpoint = (lowerBound + upperBound) / 2;
    const midpointChord = maxSwirlChordLength(radius, midpoint, swirlFalloff);

    if (midpointChord <= force) {
      lowerBound = midpoint;
    } else {
      upperBound = midpoint;
    }
  }

  return lowerBound;
}

export function resolveSwirlStrengthDegrees(
  parameters: ParameterValues,
  radius: number,
): number {
  const maximumAllowedAngle = maxAllowedSwirlStrengthForRadius(
    parameters.force,
    radius,
    parameters.swirlFalloff,
    MAX_SWIRL_ANGLE_DEGREES,
  );

  return (maximumAllowedAngle * parameters.swirlStrengthPercent) / 100;
}

export function maxAllowedSwirlStrengthForRadius(
  force: number,
  radius: number,
  swirlFalloff: number,
  maximumStrengthDegrees: number,
): number {
  return clampSwirlStrengthToForce(
    maximumStrengthDegrees,
    force,
    radius,
    swirlFalloff,
  );
}

export function maxSwirlRadiusInWorldUnits(parameters: ParameterValues): number {
  const chordFactor = maxSwirlChordLength(
    1,
    parameters.swirlMinimumAngleDegrees,
    parameters.swirlFalloff,
  );

  if (chordFactor <= 1e-6) {
    return Math.min(parameters.renderWidth, parameters.renderHeight) / 2;
  }

  return Math.min(
    parameters.force / chordFactor,
    Math.min(parameters.renderWidth, parameters.renderHeight) / 2,
  );
}

export function minSwirlRadiusInWorldUnits(parameters: ParameterValues): number {
  return Math.min(
    maxSwirlRadiusInWorldUnits(parameters),
    Math.min(parameters.renderWidth, parameters.renderHeight) * MIN_SWIRL_RADIUS_RATIO,
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (value <= edge0) {
    return 0;
  }
  if (value >= edge1) {
    return 1;
  }

  const normalizedValue = (value - edge0) / (edge1 - edge0);
  return normalizedValue * normalizedValue * (3 - 2 * normalizedValue);
}
