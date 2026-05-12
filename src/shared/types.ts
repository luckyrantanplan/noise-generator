export interface ParameterValues {
  force: number;
  scale: number;
  gridSparseness: number;
  showHeatmap: boolean;
  vectorOverlayDensity: number;
  spectralSlopeDbPerOct: number;
  amplitudeContrast: number;
  amplitudeMax: number;
  swirlDensity: number;
  swirlRadius: number;
  swirlStrength: number;
  swirlFalloff: number;
  swirlDirectionBias: number;
  directionNoiseMix: number;
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

export interface SwirlCenter {
  positionX: number;
  positionY: number;
  radius: number;
  direction: -1 | 1;
}

export interface VectorField {
  grid: GridSpec;
  amplitude: Float32Array;
  direction: Float32Array;
  displacementX: Float32Array;
  displacementY: Float32Array;
  magnitude: Float32Array;
  swirls: SwirlCenter[];
}

export interface RenderOptions {
  width: number;
  height: number;
  showHeatmap: boolean;
  vectorOverlayDensity: number;
}
