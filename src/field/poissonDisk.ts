import { clamp } from "../shared/params.js";
import type { GridSpec, ParameterValues, SwirlCenter } from "../shared/types.js";
import {
  maxSwirlRadiusInWorldUnits,
  minSwirlRadiusInWorldUnits,
  resolveSwirlStrengthDegrees,
} from "../shared/swirlBudget.js";
import { shortSideMetricScales } from "./grid.js";
import type { SeededRandom } from "./hashSeed.js";
import { packDisks } from "./variousDiskPacking.js";

interface PoissonOptions {
  grid: GridSpec;
  density: number;
  force: number;
  renderWidth: number;
  renderHeight: number;
  minimumAngleDegrees: number;
  strengthPercent: number;
  swirlFalloff: number;
  directionBias: number;
}

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
  if (options.density <= 0 || options.strengthPercent <= 0 || options.force <= 0) {
    return [];
  }

  const parameterProxy: ParameterValues = {
    renderWidth: options.renderWidth,
    renderHeight: options.renderHeight,
    force: options.force,
    scale: 0,
    silenceCutoffPercent: 100,
    gridSparseness: 1,
    showHeatmap: true,
    vectorOverlayDensity: 1,
    spectralSlopeDbPerOct: 0,
    amplitudeContrast: 1,
    swirlDensity: options.density,
    swirlMinimumAngleDegrees: options.minimumAngleDegrees,
    swirlStrengthPercent: options.strengthPercent,
    swirlFalloff: options.swirlFalloff,
    swirlDirectionBias: options.directionBias,
    directionNoiseMix: 0,
    randomSeed: "",
  };
  const metricScales = shortSideMetricScales(options.grid);
  const bounds = {
    width: metricScales.xScale,
    height: metricScales.yScale,
  };
  const targetCount = Math.max(
    1,
    Math.round(options.density * bounds.width * bounds.height),
  );
  const shortSide = Math.min(options.renderWidth, options.renderHeight);
  const minRadius = minSwirlRadiusInWorldUnits(parameterProxy) / shortSide;
  const maxRadius = maxSwirlRadiusInWorldUnits(parameterProxy) / shortSide;
  const disks = packDisks({
    bounds,
    minRadius,
    maxRadius,
    targetCount,
    random,
  });

  return disks.map((disk) => {
    const direction = random.next() < options.directionBias ? 1 : -1;
    const radiusInWorldUnits = disk.r * shortSide;
    return {
      positionX: disk.x / metricScales.xScale,
      positionY: disk.y / metricScales.yScale,
      radius: disk.r,
      strengthDegrees: resolveSwirlStrengthDegrees(parameterProxy, radiusInWorldUnits),
      direction,
    };
  });
}
