export interface ParameterValues {
  renderWidth: number;
  renderHeight: number;
  maxTraceLength: number;
  targetTurnAngleDegrees: number;
  scale: number;
  silenceCutoffPercent: number;
  gridSparseness: number;
  showHeatmap: boolean;
  vectorOverlayDensity: number;
  spectralSlopeDbPerOct: number;
  randomSeed: string;
}

export interface GridSpec {
  width: number;
  height: number;
}

export interface ScalarField {
  grid: GridSpec;
  values: Float32Array;
}

export interface VectorField {
  grid: GridSpec;
  direction: Float32Array;
  displacementX: Float32Array;
  displacementY: Float32Array;
  magnitude: Float32Array;
  maximumDisplacementMagnitude: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  showHeatmap: boolean;
  vectorOverlayDensity: number;
}

export interface DisplacementBinaryMetadata {
  parameters: ParameterValues;
  grid: GridSpec;
  renderWidth: number;
  renderHeight: number;
  sampleFormat: "f32-interleaved-dxdy";
  ordering: "row-major";
  displacementRule: "p_plus_z";
}

export interface DecodedDisplacementField {
  metadata: DisplacementBinaryMetadata;
  displacements: Float32Array;
}
