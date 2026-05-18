# Noise Generator

Noise Generator is a TypeScript displacement-field generator for rectangular domains. The current implementation builds one FFT-filtered scalar field, traces isolines through each grid sample, and converts each traced isoline segment into a displacement vector by endpoint offset.

In the preview, the heatmap shows that source scalar field while the arrows show the traced displacement vectors along the isolines.

The app provides:

- a browser preview served by a small Node HTTP server
- SVG rendering of the generated vector field
- binary export of interleaved `dx, dy` samples
- deterministic output for a fixed seed and parameter set

## Current Model

For each grid sample $p$, the generator:

1. samples the scalar level at $p$
2. finds the isoline containing $p$
3. walks that isoline until either the net turning reaches `targetTurnAngleDegrees` or the walked arc length reaches `maxTraceLength`
4. stores the displacement vector:

$$
D(p) = p_{final} - p
$$

The scalar field is created from FFT-filtered white noise. The tracer currently uses cubic interpolation on cell edges plus cell-to-cell contour stepping.

## Important Parameters

- `maxTraceLength`: maximum isoline walk length per sample
- `targetTurnAngleDegrees`: net turning threshold before stopping
- `scale`: spectral cutoff radius of the scalar source field
- `silenceCutoffPercent`: hard spectral cutoff
- `spectralSlopeDbPerOct`: spectral rolloff
- `gridSparseness`: simulation resolution
- `randomSeed`: deterministic seed

## Binary Format

The current binary displacement format version is 3.
Older binaries from the previous swirl-based schema are intentionally rejected.

## Documentation

The detailed current algorithm description is in [docs/specification.md](/home/florian/copilotTest/noise_generator/docs/specification.md).

That specification also explains what a stricter Cubic Marching Squares implementation would mean beyond the current edge-cubic, cell-to-cell tracer.
