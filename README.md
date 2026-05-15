# Noise Generator

Noise Generator is a TypeScript displacement-field generator for rectangular domains. It builds a continuous 2D vector field by combining FFT-filtered noise with packed local swirls, then serves a live SVG preview and a binary export format for downstream processing.

The current implementation is an interactive browser app backed by a small Node HTTP server. The field generator enforces a hard displacement limit through per-swirl angle resolution plus direct composition, so every generated vector stays within the requested maximum magnitude.

## What It Generates

For each grid point in a rectangular region, the app produces a displacement vector:

$$
D(x, y) = (dx(x, y), dy(x, y))
$$

The field is built from:

- FFT-filtered noise for large-scale amplitude and direction structure
- Packed local swirls that add rotational features without overlapping supports
- A force-limited swirl solver that keeps the final displacement magnitude bounded by `force`

The result is reproducible for a given seed and parameter set.

## Mathematical Model

At each grid sample, the generator evaluates a noise term and a swirl term, then adds them directly:

$$
D(x, y) = S(x, y) + N(x, y)
$$

The final stored field is:

$$
D(x, y) = (dx(x, y), dy(x, y)), \qquad |D(x, y)| \le F
$$

where $F$ is the user-facing `force` parameter.

### Noise Term

Two independent scalar noises are synthesized on the same grid:

- a magnitude-driving field $M_0$
- a direction-driving field $\Theta_0$

Each starts as white noise in $[-1, 1]$, is FFT-filtered, inverse transformed, then normalized back into $[0, 1]$.

The filtered magnitude is shaped by contrast:

$$
A(x, y) = \operatorname{clamp}(M(x, y), 0, 1)^{c}
$$

where $c =$ `amplitudeContrast`.

The filtered direction field becomes an angle:

$$
\\theta_{noise}(x, y) = 2\\pi \\cdot \\Theta(x, y)
$$

so the raw noise displacement is:

$$
N_0(x, y) = F \cdot A(x, y) \cdot
\left(\cos \theta_{noise}(x, y), \sin \theta_{noise}(x, y)\right)
$$

Inside swirl support, the noise term is attenuated by a radial gain $g(u)$ where $u \in [0, 1]$ is the normalized distance to the swirl center:

$$
g(u) = m + (1 - m) \cdot u^2 (3 - 2u)
$$

where $m =$ `directionNoiseMix`. The implementation writes this as:

$$
g(u) = m + (1 - m) \cdot \operatorname{smoothstep}(0, 1, u)
$$

and uses the minimum gain across overlapping attenuation influences. Because packed swirl supports do not overlap, this normally means one active swirl at most.

The attenuated noise vector is:

$$
N(x, y) = g(u) \cdot N_0(x, y)
$$

### Spectral Envelope

The FFT filter uses a radial spectral envelope measured in frequency units of the longest grid side. Let $r$ be the isotropic frequency radius after aspect correction. The filter is:

$$
E(r) =
\begin{cases}
0 & r = 0 \\
0 & r > r_{silence} \\
\left(1 + \left(\frac{r}{r_c}\right)^2\right)^{-p/4} & \text{otherwise}
\end{cases}
$$

with:

$$
r_c = \max\left(1, \frac{\text{scale}}{100} \cdot L\right),
\qquad
r_{silence} = \max\left(0, \frac{\text{Fsilence}}{100} \cdot L\right)
$$

where $L$ is the longest side of the simulation grid and $p$ is the power slope derived from `spectralSlopeDbPerOct`.

### Swirl Term

Each swirl is a packed disk with center $c$, radius $R$, direction $\sigma \in \{-1, +1\}$, and one global resolved angle $\theta_s$ in degrees.

For a sample point $p$, let:

$$
\Delta = p - c,
\qquad
u = \frac{|\Delta|}{R}
$$

in aspect-correct short-side metric space.

The radial swirl envelope is:

$$
w(u) = s(u; 0.02, 0.06) \cdot \left(1 - s(u; 0.9, 1.0)\right)^{f}
$$

where $s(u; a, b)$ is `smoothstep(a, b, u)` and $f =$ `swirlFalloff`.

This gives three deliberate behaviors:

- a tiny dead zone at the center to avoid singular-looking rotation
- a strong interior band where the swirl is visually dominant
- a tapered outer edge so the displacement goes smoothly to zero at the support boundary

The local rotation angle is:

$$
\phi(u) = \sigma \cdot \theta_s \cdot \frac{\pi}{180} \cdot w(u)
$$

The swirl displacement is not tangent velocity. It is the chord obtained by rotating the offset vector by $\phi(u)$ and subtracting the original offset:

$$
S(x, y) = R_{\phi(u)}(\Delta) - \Delta
$$

This choice makes the swirl term geometrically interpretable and keeps the force bound tied to actual reachable chord length.

### Global Swirl Angle Budget

The current implementation applies one global force-limited angle per swirl.

For a candidate swirl angle $\theta$, the solver samples normalized radius $u \in [0, 1]$ and computes the local chord demand:

$$
\operatorname{chord}(u; R, \theta) = 2uR \cdot \left|\sin\left(\frac{\theta \pi}{180} \cdot \frac{w(u)}{2}\right)\right|
$$

It then reserves room for the surviving noise term at the same radius:

$$
\operatorname{noiseReserve}(u) = F \cdot g(u)
$$

The admissible global swirl angle is the largest $\theta$ such that:

$$
\max_{u \in [0, 1]}
\left(
\operatorname{chord}(u; R, \theta) + \operatorname{noiseReserve}(u)
\right)
\le F
$$

The implementation solves this numerically with a deterministic binary search. The user-facing `swirlStrengthPercent` is then applied as:

$$
\\theta_s = \\frac{\\text{swirlStrengthPercent}}{100} \\cdot \\theta_{max}(R)
$$

Design choices:

- one swirl gets one global angle
- the whole support weakens uniformly when noise reservation increases
- no per-pixel rebudgeter changes formula inside a swirl anymore
- larger radii and larger `directionNoiseMix` both reduce the resolved attainable angle

### Current Budget Failure Mode

The current solver is mathematically valid but visually too conservative for the default swirl look.

The important detail is that the solver does not reserve the realized local noise magnitude. It reserves an upper bound:

$$
\operatorname{noiseReserve}(u) = F \cdot g(u)
$$

where $F$ is the global force limit and $g(u)$ is the surviving noise ratio inside the swirl support.

That means the admissible angle is solved against a worst-case assumption: the noise term is treated as if it could fully use its remaining allowance at every radius, even when the actual sampled noise vector at that radius is much smaller.

This becomes especially restrictive in the outer swirl band:

- the swirl envelope $w(u)$ stays near full strength until roughly $u=0.9$
- the lever arm in the chord term grows like $uR$
- the reserved noise term $F \cdot g(u)$ is already close to $F$ in that same region

So the controlling constraint usually comes from a ring near the outer support boundary, where both of these are true at once:

$$
\operatorname{chord}(u; R, \theta)
= 2uR \cdot \left|\sin\left(\frac{\theta\pi}{180} \cdot \frac{w(u)}{2}\right)\right|
$$

and

$$
\operatorname{noiseReserve}(u) \approx F
$$

At that radius, only a very small displacement budget remains available for the swirl chord, so the globally admissible angle collapses to a few degrees. In practice this produces two visible behaviors:

- the swirl often suppresses the noise term near its center more than it increases the final magnitude
- the final vector directions inside the circle change only weakly, so the field does not read as a concrete vortex

This is why circles can appear clearly marked in the preview while still contributing only a small directional change to the final field.

### Artistic Replacement Options

The replacement should satisfy three constraints at the same time:

- the final field must obey $|D(x, y)| \le F$
- the swirls must stay artistically legible in the final field
- the behavior must stay continuous, with no hard allocator switch caused by a small local change inside a swirl

The important design rule is therefore simple: if the formula changes around a swirl, it should change through smooth envelopes, not through abrupt local regime changes.

#### Option A: Keep Force-Limited Swirls and Reduce Noise Per Swirl

Keep the additive composition model:

$$
D(x, y) = S(x, y) + N(x, y)
$$

and keep the existing force-limited swirl construction so the swirl term alone already satisfies:

$$
M_S = \max_{p \in \text{support}} |S(p)| \le F.
$$

Then define the smooth local noise term:

$$
N_s(p) = g(u(p)) \cdot N_0(p)
$$

with a smooth radial envelope and $g(1) = 1$, so the noise term matches the surrounding field at the swirl boundary.

Assign one scalar $\alpha_s \in [0, 1]$ to the whole swirl support:

$$
D(p) = S(p) + \alpha_s N_s(p).
$$

Let

$$
M_N = \max_{p \in \text{support}} |N_s(p)|.
$$

Then choose:

$$
\alpha_s = \operatorname{clamp}\left(\frac{F - M_S}{M_N}, 0, 1\right)
$$

when $M_N > 0$.

This gives the conservative guarantee:

$$
|S(p) + \alpha_s N_s(p)|
\le |S(p)| + \alpha_s |N_s(p)|
\le M_S + \alpha_s M_N
\le F.
$$

Because $g$ is smooth and $\alpha_s$ is constant across the whole support, this option avoids new discontinuities inside the swirl. It is also easy to explain: the swirl keeps its shape, and the background noise yields smoothly where the swirl needs room.

#### Option B: Use a Stronger Smooth Noise-Attenuation Curve

Option A can be combined with a more aggressive but still smooth survival curve for the noise term.

Instead of:

$$
g(u) = DirectionNoiseMix + (1 - DirectionNoiseMix) \cdot s(u; 0, 1)
$$

use a curve that stays lower through more of the interior while still returning to $1$ at the outer boundary. For example:

$$
g_k(u) = DirectionNoiseMix + (1 - DirectionNoiseMix) \cdot s(u; 0, 1)^k,
\qquad k > 1.
$$

This does not change the composition rule. It only says that inside a vortex, the background should step back more decisively, but still smoothly.

#### Option C: Smoothly Blend Between Swirl and Noise

If additive composition is not required, a more explicitly art-directed option is to use one smooth blend weight $\beta_s(u) \in [0, 1]$:

$$
D(p) = \beta_s(u(p)) S(p) + (1 - \beta_s(u(p))) N_s(p).
$$

If both terms are individually bounded by $F$, then the blend also remains bounded:

$$
|D(p)| \le \beta_s(u(p)) F + (1 - \beta_s(u(p))) F = F.
$$

This is continuous as long as $\beta_s$ is smooth, but it is less faithful to the idea that the final field is literally swirl plus noise. It behaves more like an artistic crossfade.

#### Option D: Apply One Smooth Global Saturation After Composition

Another possibility is to build a raw field

$$
D_{raw}(x, y) = S(x, y) + N(x, y)
$$

and then apply the same smooth magnitude compressor everywhere in the domain, not only inside swirls. In abstract form:

$$
D(x, y) =
\begin{cases}
0, & D_{raw}(x, y) = 0 \\
\sigma\left(|D_{raw}(x, y)|\right) \cdot \dfrac{D_{raw}(x, y)}{|D_{raw}(x, y)|}, & D_{raw}(x, y) \ne 0
\end{cases}
$$

with a smooth function $\sigma(r)$ such that $\sigma(r) \le F$ and $\sigma(r) \approx r$ well below the limit.

This avoids local seams because the same formula is used everywhere, but it also distorts magnitudes globally and is the least faithful to the original additive interpretation.

#### Option E: Keep or Redesign the Swirl Envelope

The current swirl envelope is weak at the center and weak again at the outer edge:

$$
w(u) = s(u; 0.02, 0.06) \cdot (1 - s(u; 0.9, 1))^{SwirlFalloff}
$$

So even after fixing the noise budget, the swirl can still read as a ring-shaped vortex rather than a center-strong vortex.

That is a separate artistic choice:

- keep the current ring-shaped profile
- or redesign the envelope if a center-strong vortex is preferred

### Recommended Direction

If the priority is a robust artistic solution with no local discontinuities, prefer Option A, optionally strengthened by Option B.

The recommended recipe is:

1. keep the current force-limited swirl construction so the swirl term alone already respects $F$
2. keep additive composition
3. replace only the shared swirl-noise budget solver, not the whole swirl model
4. compute one global noise-reduction scalar per swirl support
5. use only smooth radial envelopes where the swirl transitions back to the surrounding field
6. if the swirl still reads too weakly, strengthen the smooth noise attenuation curve rather than introducing a local allocator switch

That direction stays simple to document, easy to test, and aligned with the artistic intent: circles should create concrete turning, but the field should not show seams caused by a tiny change in local position.

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
- `silenceCutoffPercent`: hard spectral cutoff percentage; frequencies above this threshold are zeroed completely
- `spectralSlopeDbPerOct`: spectral rolloff in dB per octave
- `amplitudeContrast`: contrast applied to the normalized magnitude field
- `directionNoiseMix`: how strongly noise survives inside swirl support

### Swirls

- `swirlDensity`: approximate density of swirl centers across the field
- `swirlMinimumAngleDegrees`: minimum allowable swirl angle, which constrains the largest swirl radius under the force limit
- `swirlStrengthPercent`: requested swirl intensity as a percentage of each swirl's maximum globally force-limited angle
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

## Generation Steps

The current implementation follows this sequence:

1. Convert `renderWidth`, `renderHeight`, and `gridSparseness` into a simulation grid.
2. Generate independent seeded white-noise fields for magnitude and direction.
3. FFT-filter both scalar fields with the same soft spectral corner (`scale`), hard silence cutoff (`silenceCutoffPercent`), and spectral slope.
4. Normalize the filtered fields back into $[0, 1]$.
5. Raise the magnitude field to `amplitudeContrast` to obtain the scalar amplitude map.
6. Sample non-overlapping swirl disks in aspect-correct short-side metric space.
7. For each sampled swirl radius, solve a single admissible global swirl angle that leaves room for the reserved noise term.
8. Rasterize swirl displacement and swirl-driven noise attenuation onto the grid.
9. Convert the filtered direction field into angles and build the raw noise displacement vector at magnitude `force * amplitude`.
10. Attenuate the noise vector inside swirl support with the radial noise-gain function.
11. Add the swirl vector and the attenuated noise vector directly.
12. Store direction, displacement components, magnitude, and swirl metadata for rendering and export.

## Why These Choices

- Non-overlapping swirls: keeps one swirl support active at most per point, which makes the force argument local and much easier to guarantee.
- Chord-based swirl displacement: matches the actual geometric effect of local rotation better than a tangent-only approximation.
- Longest-side spectral units: keeps spectral controls isotropic on rectangular grids.
- Hard `Fsilence` cutoff in addition to soft `scale`: lets the user remove very high frequencies completely without giving up a smooth rolloff below that threshold.
- Global swirl-angle budgeting instead of per-pixel rebudgeting: removes allocator seams and makes the field model “one swirl, one angle”.
- No final clamp: avoids hiding invalid intermediate logic and keeps the force guarantee tied to explicit construction steps.

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
- `src/field/composeField.ts`: generates the final vector field by adding the globally budgeted swirl term and the attenuated noise term
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

The original project specification in `docs/specification.md` now mirrors the implemented force-limited swirl model, but the current implementation remains the source of truth when documentation and code disagree. In particular, the shipped app renders server-generated SVG and exposes the parameter set defined in `src/shared/params.ts`.
