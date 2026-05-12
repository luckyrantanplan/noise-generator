import type { RenderOptions, VectorField } from "../shared/types.js";
import { indexAt, normalizedCoordinate } from "../field/grid.js";

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  width: 960,
  height: 720,
  showHeatmap: true,
  vectorOverlayDensity: 16,
  heatmapCellSize: 1,
};

interface ColorStop {
  value: number;
  red: number;
  green: number;
  blue: number;
}

const COLOR_STOPS: ColorStop[] = [
  { value: 0, red: 7, green: 13, blue: 30 },
  { value: 0.34, red: 17, green: 100, blue: 102 },
  { value: 0.68, red: 246, green: 211, blue: 101 },
  { value: 1, red: 249, green: 115, blue: 22 },
];

export function renderFieldSvg(
  field: VectorField,
  options: RenderOptions,
): string {
  const cellWidth = options.width / field.grid.width;
  const cellHeight = options.height / field.grid.height;
  const maximumMagnitude = getMaximumMagnitude(field);
  const heatmap = options.showHeatmap
    ? renderHeatmap(field, options, cellWidth, cellHeight, maximumMagnitude)
    : "";
  const arrows = renderArrows(field, options, maximumMagnitude);
  const swirls = renderSwirlCenters(field, options);
  const scaleBar = renderScaleBar(options);
  const heatmapLayer = options.showHeatmap
    ? `<g shape-rendering="crispEdges">${heatmap}</g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(options.width)}" height="${formatNumber(options.height)}" viewBox="0 0 ${formatNumber(options.width)} ${formatNumber(options.height)}" role="img" aria-label="Generated displacement field">
<defs>
<marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="#f8fafc" opacity="0.82" />
</marker>
</defs>
<rect width="100%" height="100%" fill="#020617" />
${heatmapLayer}
<g stroke="#f8fafc" stroke-width="1" stroke-linecap="round" marker-end="url(#arrowhead)" opacity="0.84">${arrows}</g>
<g fill="none" stroke="#e2e8f0" stroke-width="1" opacity="0.45">${swirls}</g>
${scaleBar}
</svg>`;
}

function getMaximumMagnitude(field: VectorField): number {
  let maximumMagnitude = Number.EPSILON;

  for (const magnitude of field.magnitude) {
    if (magnitude > maximumMagnitude) {
      maximumMagnitude = magnitude;
    }
  }

  return maximumMagnitude;
}

function renderHeatmap(
  field: VectorField,
  options: RenderOptions,
  cellWidth: number,
  cellHeight: number,
  maximumMagnitude: number,
): string {
  const fragments: string[] = [];
  for (
    let rowIndex = 0;
    rowIndex < field.grid.height;
    rowIndex += options.heatmapCellSize
  ) {
    const blockHeight = Math.min(
      options.heatmapCellSize,
      field.grid.height - rowIndex,
    );
    for (
      let columnIndex = 0;
      columnIndex < field.grid.width;
      columnIndex += options.heatmapCellSize
    ) {
      const blockWidth = Math.min(
        options.heatmapCellSize,
        field.grid.width - columnIndex,
      );
      const normalizedMagnitude = averageBlockMagnitude(
        field,
        columnIndex,
        rowIndex,
        blockWidth,
        blockHeight,
        maximumMagnitude,
      );
      const color = colorAt(normalizedMagnitude);
      const positionX = columnIndex * cellWidth;
      const positionY = rowIndex * cellHeight;
      fragments.push(
        `<rect x="${formatNumber(positionX)}" y="${formatNumber(positionY)}" width="${formatNumber(blockWidth * cellWidth + 0.4)}" height="${formatNumber(blockHeight * cellHeight + 0.4)}" fill="${color}" />`,
      );
    }
  }
  return fragments.join("");
}

function renderArrows(
  field: VectorField,
  options: RenderOptions,
  maximumMagnitude: number,
): string {
  const fragments: string[] = [];
  const arrowScale = Math.min(options.width, options.height) * 0.038;
  const arrowStep = densityToArrowStep(options.vectorOverlayDensity, field);
  for (
    let rowIndex = 0;
    rowIndex < field.grid.height;
    rowIndex += arrowStep
  ) {
    for (
      let columnIndex = 0;
      columnIndex < field.grid.width;
      columnIndex += arrowStep
    ) {
      const scalarIndex = indexAt(columnIndex, rowIndex, field.grid);
      const centerX =
        normalizedCoordinate(columnIndex, field.grid.width) * options.width;
      const centerY =
        normalizedCoordinate(rowIndex, field.grid.height) * options.height;
      const magnitudeRatio = field.magnitude[scalarIndex] / maximumMagnitude;
      const arrowLength = 6 + magnitudeRatio * arrowScale;
      const angle = field.direction[scalarIndex];
      const endX = centerX + Math.cos(angle) * arrowLength;
      const endY = centerY + Math.sin(angle) * arrowLength;
      fragments.push(
        `<line x1="${formatNumber(centerX)}" y1="${formatNumber(centerY)}" x2="${formatNumber(endX)}" y2="${formatNumber(endY)}" />`,
      );
    }
  }
  return fragments.join("");
}

function averageBlockMagnitude(
  field: VectorField,
  startColumn: number,
  startRow: number,
  blockWidth: number,
  blockHeight: number,
  maximumMagnitude: number,
): number {
  let magnitudeTotal = 0;
  const cellCount = blockWidth * blockHeight;

  for (let rowOffset = 0; rowOffset < blockHeight; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < blockWidth; columnOffset += 1) {
      const scalarIndex = indexAt(
        startColumn + columnOffset,
        startRow + rowOffset,
        field.grid,
      );
      magnitudeTotal += field.magnitude[scalarIndex];
    }
  }

  return magnitudeTotal / cellCount / maximumMagnitude;
}

function densityToArrowStep(
  vectorOverlayDensity: number,
  field: VectorField,
): number {
  const shortestSide = Math.min(field.grid.width, field.grid.height);
  return Math.max(1, Math.round(shortestSide / vectorOverlayDensity));
}

function renderSwirlCenters(
  field: VectorField,
  options: RenderOptions,
): string {
  return field.swirls
    .map((swirl) => {
      const centerX = swirl.positionX * options.width;
      const centerY = swirl.positionY * options.height;
      const radius = swirl.radius * Math.min(options.width, options.height);
      return `<circle cx="${formatNumber(centerX)}" cy="${formatNumber(centerY)}" r="${formatNumber(radius)}" />`;
    })
    .join("");
}

function renderScaleBar(options: RenderOptions): string {
  const barLength = options.width * 0.5;
  const startX = options.width * 0.08;
  const endX = startX + barLength;
  const midX = startX + barLength / 2;
  const baselineY = options.height * 0.92;
  const topTickY = baselineY - options.height * 0.012;
  const bottomTickY = baselineY + options.height * 0.012;
  const titleY = baselineY - options.height * 0.03;
  const labelY = baselineY + options.height * 0.04;

  return `<g fill="#f8fafc" stroke="#f8fafc" stroke-width="1.2" opacity="0.92" aria-label="Scale bar overlay">
<line x1="${formatNumber(startX)}" y1="${formatNumber(baselineY)}" x2="${formatNumber(endX)}" y2="${formatNumber(baselineY)}" />
<line x1="${formatNumber(startX)}" y1="${formatNumber(topTickY)}" x2="${formatNumber(startX)}" y2="${formatNumber(bottomTickY)}" />
<line x1="${formatNumber(midX)}" y1="${formatNumber(topTickY)}" x2="${formatNumber(midX)}" y2="${formatNumber(bottomTickY)}" />
<line x1="${formatNumber(endX)}" y1="${formatNumber(topTickY)}" x2="${formatNumber(endX)}" y2="${formatNumber(bottomTickY)}" />
<text x="${formatNumber(startX)}" y="${formatNumber(titleY)}" font-size="7" stroke="none">Scale (SVG units)</text>
<text x="${formatNumber(startX)}" y="${formatNumber(labelY)}" font-size="6" text-anchor="middle" stroke="none">0</text>
<text x="${formatNumber(midX)}" y="${formatNumber(labelY)}" font-size="6" text-anchor="middle" stroke="none">${formatNumber(barLength / 2)}</text>
<text x="${formatNumber(endX)}" y="${formatNumber(labelY)}" font-size="6" text-anchor="middle" stroke="none">${formatNumber(barLength)}</text>
</g>`;
}

function colorAt(value: number): string {
  const clampedValue = Math.min(1, Math.max(0, value));
  let startStop = COLOR_STOPS[0];
  let endStop = COLOR_STOPS[COLOR_STOPS.length - 1];

  for (let index = 1; index < COLOR_STOPS.length; index += 1) {
    if (clampedValue <= COLOR_STOPS[index].value) {
      startStop = COLOR_STOPS[index - 1];
      endStop = COLOR_STOPS[index];
      break;
    }
  }

  const localRange = endStop.value - startStop.value;
  const ratio =
    localRange <= Number.EPSILON
      ? 0
      : (clampedValue - startStop.value) / localRange;
  const red = Math.round(startStop.red + (endStop.red - startStop.red) * ratio);
  const green = Math.round(
    startStop.green + (endStop.green - startStop.green) * ratio,
  );
  const blue = Math.round(
    startStop.blue + (endStop.blue - startStop.blue) * ratio,
  );
  return `rgb(${String(red)} ${String(green)} ${String(blue)})`;
}

function formatNumber(value: number): string {
  return value.toFixed(3).replace(/\.000$/, "");
}
