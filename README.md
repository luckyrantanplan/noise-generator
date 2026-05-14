# Noise Generator

Noise Generator is a TypeScript displacement-field generator for rectangular domains. It builds a continuous 2D vector field by combining FFT-filtered noise with packed local swirls, then serves a live SVG preview and a binary export format for downstream processing.

The current implementation is an interactive browser app backed by a small Node HTTP server. The field generator enforces a hard displacement limit through a shared force budget, so every generated vector stays within the requested maximum magnitude.

## What It Generates

For each grid point in a rectangular region, the app produces a displacement vector:

$$
D(x, y) = (dx(x, y), dy(x, y))
$$

The field is built from:

- FFT-filtered noise for large-scale amplitude and direction structure
- Packed local swirls that add rotational features without overlapping supports
- A shared force budget that keeps the final displacement magnitude bounded by `force`

The result is reproducible for a given seed and parameter set.

## Requirements

- Node.js 22.13 or newer
- npm

The development server serves browser JavaScript directly from TypeScript source using Node's native `stripTypeScriptTypes`, so a recent Node release is required.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

This builds the TypeScript sources and starts the HTTP server on `http://localhost:4173` by default.
This starts the server directly from TypeScript source through `tsx` and serves browser modules from `src/*.ts` as stripped JavaScript at `/src/*.js`.

To use a different port:

```bash
PORT=5000 npm start
```

Do not open `index.html` directly from the filesystem. The client depends on server routes for source-served browser modules and generated field responses.

## Using The App

When the server is running:

1. Open `http://localhost:4173` in a browser.
2. Adjust the controls in the sidebar.
3. The preview refreshes by requesting a fresh SVG from `/api/field.svg`.
4. Use `Export Binary` to download `displacement-field.bin`.
5. Use `Import Binary` to load a previously exported file.

Import restores the saved parameter metadata from the binary file and regenerates the preview from those parameters. It does not render the imported sample payload directly.

## Parameters

The UI groups controls into four sections.

### Field Shape

- `force`: maximum allowed displacement magnitude in SVG units
- `scale`: shared spectral cutoff percentage for magnitude and direction noise
- `spectralSlopeDbPerOct`: spectral rolloff in dB per octave
- `amplitudeContrast`: contrast applied to the normalized magnitude field
- `directionNoiseMix`: how strongly noise survives inside swirl support

### Swirls

- `swirlDensity`: approximate density of swirl centers across the field
- `swirlMinimumAngleDegrees`: minimum allowable swirl angle, which constrains the largest swirl radius under the force limit
- `swirlStrengthPercent`: requested swirl intensity as a percentage of each swirl's maximum force-limited angle
- `swirlFalloff`: radial falloff shape for swirl influence
- `swirlDirectionBias`: clockwise versus counterclockwise bias

### Display

- `renderWidth`: SVG output width in SVG units
- `renderHeight`: SVG output height in SVG units
- `gridSparseness`: simulation cell size in SVG units
- `vectorOverlayDensity`: arrow overlay sampling density
- `showHeatmap`: toggles the magnitude heatmap overlay

### Seed

- `randomSeed`: deterministic input used to reproduce the same field

The authoritative parameter definitions, defaults, and descriptions live in `src/shared/params.ts`.

## Output Formats

### SVG Preview

The interactive preview is rendered server-side as SVG and returned from `/api/field.svg`.

The rendered output can include:

- a magnitude heatmap
- vector overlays
- swirl guides and scale annotations

### Binary Export

Binary export is served from `/api/field.bin` as `displacement-field.bin`.

The binary file contains:

- metadata encoded as JSON in the file header
- a row-major displacement grid
- interleaved `Float32` displacement samples in `(dx, dy)` order

Important format details:

- magic: `DFLD`
- version: `2`
- sample format: `f32-interleaved-dxdy`
- ordering: `row-major`
- displacement rule: `p_plus_z`

Version 1 files are intentionally rejected. The codec is implemented in `src/shared/displacementBinary.ts`.

## Project Structure

```text
src/
  client/   Browser UI, controls, preview refresh, import/export actions
  field/    Noise synthesis, spectral filtering, grid logic, swirl generation, field composition
  server/   HTTP server, SVG rendering, binary export
  shared/   Parameter parsing, shared types, binary format
test/       Unit and integration tests
docs/       Specification and planning notes
```

Key modules:

- `src/client/index.ts`: builds the controls, triggers preview refreshes, handles binary import/export
- `src/server/server.ts`: serves the app shell, strips browser-facing TypeScript modules to JavaScript on demand, and exposes the SVG and binary endpoints
- `src/field/composeField.ts`: generates the final vector field and applies the shared force budget
- `src/server/renderSvg.ts`: converts generated field data into SVG output
- `src/shared/displacementBinary.ts`: defines the binary displacement format and codec

## Scripts

- `npm run check`: typecheck the TypeScript project with no emitted output, then run ESLint
- `npm start`: run the server directly from TypeScript source with `tsx`
- `npm test`: run the TypeScript test suite through Node with `tsx`
- `npm run coverage`: run tests with experimental coverage output
- `npm run lint`: run ESLint across the repository
- `npm run format`: format the repository with Prettier

## Validation

The existing test suite covers:

- field determinism and force-bounded output
- grid sizing and swirl packing behavior
- SVG and binary server endpoints
- binary encoding and version handling

Run the checks you need with:

```bash
npm run check
npm test
```

## Notes

The original project specification in `docs/specification.md` describes the same overall goal, but the current implementation is the source of truth for the README. In particular, the shipped app renders server-generated SVG and exposes the parameter set defined in `src/shared/params.ts`.