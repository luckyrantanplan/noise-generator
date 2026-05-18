Specification: Isoline-Driven 2D Displacement Field Generator

Implement a 2D displacement field inside an axis-aligned rectangle. The implementation is written in TypeScript, rendered in an HTML page with interactive controls, and supports binary export of the generated displacement grid.

The current implementation no longer builds the field from separate magnitude and direction fields plus explicit swirls. It now generates one scalar field, extracts the isoline passing through each grid sample, and converts the traced isoline segment into a displacement vector.

## 1. Field Model

The output is a vector field defined on a regular 2D grid over the rectangle.
At each grid sample $p = (x, y)$, the generator stores one displacement vector:

$$
D(p) = (dx(p), dy(p))
$$

The vector is defined by tracing the isoline that passes through $p$ and then taking the endpoint offset:

$$
D(p) = p_{final} - p
$$

where $p_{final}$ is the last traced point reached before one of the stop conditions fires.

The stored magnitude is:

$$
|D(p)| = \sqrt{dx(p)^2 + dy(p)^2}
$$

and the stored direction is:

$$
\theta(p) = \operatorname{atan2}(dy(p), dx(p))
$$

The public displacement cap is `maxTraceLength`. In the shipped implementation it acts as the maximum walked arc length along the isoline. Because the stored vector is the endpoint offset of that walk, the resulting vector magnitude also satisfies:

$$
|D(p)| \le \texttt{maxTraceLength}
$$

## 2. Scalar Source Field

The isolines are derived from one FFT-filtered scalar field $S(x, y)$.

The generator pipeline is:

1. generate uniform white noise on the grid
2. compute its 2D FFT
3. apply a radial spectral envelope in frequency space
4. compute the inverse FFT
5. normalize the result into $[0, 1]$

The current radial envelope is:

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
r_c = \max\left(1, \frac{\texttt{scale}}{100} \cdot L\right),
\qquad
r_{silence} = \max\left(0, \frac{\texttt{silenceCutoffPercent}}{100} \cdot L\right)
$$

where $L$ is the longest side of the simulation grid and $p$ is derived from `spectralSlopeDbPerOct`.

This scalar field is the only procedural source used by the new tracer.

## 3. Tracing Rule

For each grid sample $p_{start}$:

1. sample the scalar level $c = S(p_{start})$
2. estimate the local gradient $\nabla S$
3. define the initial isoline tangent as a perpendicular to that gradient
4. trace the contour $S(x, y) = c$
5. stop when either the net turning angle reaches the configured target or the walked arc length reaches `maxTraceLength`

The current stop controls are:

- `targetTurnAngleDegrees`: angular stop threshold
- `maxTraceLength`: length stop threshold

The turning rule uses net turning from the initial segment direction, not accumulated absolute curvature. If $\theta_0$ is the first segment angle and $\theta_k$ is the current unwrapped segment angle, then the angular stop condition is:

$$
|\theta_k - \theta_0| \ge \theta_{target}
$$

where:

$$
\theta_{target} = \texttt{targetTurnAngleDegrees} \cdot \frac{\pi}{180}
$$

The length stop condition is:

$$
L_{walk} \ge \texttt{maxTraceLength}
$$

and the implementation truncates the final segment exactly at the remaining distance budget instead of overshooting it.

## 4. Current Cubic Marching Squares Implementation

The shipped tracer uses a partial Cubic Marching Squares style approach.

What is cubic today:

- contour-edge intersections are not solved with simple linear interpolation
- each cell edge uses a cubic Hermite interpolation built from the edge endpoint values and estimated endpoint slopes
- the edge root is solved numerically, so the crossing position on that edge respects a cubic scalar reconstruction along the edge

What is still simplified today:

- once two edge crossings are known, the traced segment inside the cell is treated as a straight segment from one crossing to the next
- branch choice is driven by incoming heading consistency, not by solving the full contour geometry of a bicubic patch over the whole cell
- angle accumulation is computed from polyline segment directions, not from the exact tangent of a continuous within-cell contour

So the current tracer is best described as:

- cubic edge interpolation
- polyline contour stepping from cell to cell
- local tangent estimation from the scalar gradient

This is already stronger than linear marching squares, but it is not yet a full strict Cubic Marching Squares solver.

## 5. What "Stricter Cubic Marching Squares" Means

The earlier implementation note about refining the tracer refers to tightening the contour model inside each cell, not changing the high-level isoline idea.

There are four concrete improvements behind that suggestion.

### 5.1 Reconstruct the Whole Cell, Not Only Its Edges

Today the code reconstructs each edge cubically and then connects edge crossings with straight segments.

A stricter version would reconstruct one scalar patch over the entire cell, typically a bicubic patch derived from:

- the four corner values
- first derivatives at the corners
- optionally mixed derivatives if a fuller bicubic model is used

Then the contour would be defined by the implicit equation:

$$
F(x, y) = c
$$

inside the cell, not only at its edges.

Why that matters:

- the contour can bend inside the cell instead of remaining piecewise straight between crossings
- the path geometry becomes smoother at coarse grid resolutions
- the traced angle is less sensitive to cell boundaries

### 5.2 Use the Cell Patch to Resolve Ambiguous Cases

Ambiguous marching-squares cells happen when the contour could connect the crossings in more than one topologically valid way.

Today the implementation picks the next branch mostly by heading agreement.

A stricter cubic version would resolve ambiguity from the interpolated scalar patch itself, for example with an asymptotic-decider-style rule or another deterministic topology decision derived from the interior scalar function.

Why that matters:

- saddle cells become mathematically defined by the scalar field, not only by the incoming direction heuristic
- two traces entering the same ambiguous cell from different sides are more likely to remain globally consistent
- loop behavior and branch continuity become easier to reason about

### 5.3 March Along the Continuous Contour Inside the Cell

Today the path jumps from one edge crossing to the next crossing.

A stricter version would advance along the actual implicit contour inside the cell using a predictor-corrector or Newton-style projection step:

1. predict a small step along the tangent
2. project that point back onto $F(x, y) = c$
3. repeat until the contour leaves the cell

Why that matters:

- the within-cell path follows the curved contour rather than its straight chord
- length accumulation becomes closer to true arc length
- the final endpoint depends less on how many cells the contour crosses

### 5.4 Compute Tangents From the Same Continuous Patch

Today the tangent is estimated from a finite-difference gradient of the sampled scalar field.

A stricter version would compute tangent and curvature directly from the same interpolated cell patch used for tracing.

If the contour is defined by $F(x, y) = c$, then the tangent remains perpendicular to the gradient, but now that gradient is evaluated from the continuous patch itself rather than from a separate finite-difference estimate.

Why that matters:

- angle accumulation matches the traced curve more closely
- turning-angle termination is less noisy near steep or rapidly changing regions
- continuity across cell boundaries improves because geometry and tangent come from one model

## 6. Practical Meaning of the Refinement Proposal

So the suggestion to "refine the tracer itself if you want stricter Cubic Marching Squares behavior inside each cell" means:

- keep the same public algorithm: scalar field -> isoline trace -> endpoint offset vector
- keep cubic contour reconstruction as the goal
- replace the current edge-only cubic interpolation plus straight interior segments with a full cell-interior contour model

In short:

- current implementation: cubic edges, polyline interior
- stricter implementation: cubic edges and cubic interior contour geometry

The current version is simpler, deterministic, and already working. The stricter version would mainly improve geometric fidelity, smoother turning behavior, and more principled handling of ambiguous cells.

## 7. Stop Conditions and Robustness

The tracer stops when any of the following happens:

- angular limit reached
- length limit reached
- trace exits the domain
- gradient becomes too small to define a stable tangent
- loop or step cap is reached

The current implementation also uses small numerical tolerances for:

- edge-root solving
- duplicate crossing suppression
- angle unwrapping around $\pm \pi$
- near-boundary detection

These guards are implementation details, but they are necessary to keep tracing deterministic on a finite grid.

## 8. Public Parameters

The current public parameter set is:

- `renderWidth`
- `renderHeight`
- `maxTraceLength`
- `targetTurnAngleDegrees`
- `scale`
- `silenceCutoffPercent`
- `gridSparseness`
- `showHeatmap`
- `vectorOverlayDensity`
- `spectralSlopeDbPerOct`
- `randomSeed`

Their intended meanings are:

- `renderWidth`, `renderHeight`: output size in SVG units
- `maxTraceLength`: maximum walked isoline length per sample
- `targetTurnAngleDegrees`: net turning threshold before stopping
- `scale`: spectral cutoff radius of the scalar source field
- `silenceCutoffPercent`: hard spectral cutoff
- `gridSparseness`: simulation grid resolution in SVG units per cell
- `showHeatmap`: toggle source scalar-field heatmap rendering
- `vectorOverlayDensity`: density of arrow sampling in the preview
- `spectralSlopeDbPerOct`: frequency rolloff of the scalar field
- `randomSeed`: deterministic seed for reproducible generation

## 9. Binary Export

The binary displacement export stores:

- the full parameter object
- the grid shape
- the render size
- interleaved `dx, dy` float32 samples in row-major order

The current binary format version is 3.
Versions from the old swirl-based schema are intentionally rejected.

## 10. Rendering

The SVG preview shows:

- a heatmap derived from the original filtered scalar field
- vector arrows derived from final `dx, dy`
- a scale bar

The old swirl-circle diagnostic overlay is no longer part of the current model.

## 11. Verification Requirements

The implementation should maintain these invariants:

1. scalar generation is deterministic for a fixed seed and parameter set
2. traced vectors are reproducible for a fixed scalar field
3. `magnitude[i] = hypot(displacementX[i], displacementY[i])`
4. `magnitude[i] <= maxTraceLength + \varepsilon`
5. binary export and import preserve the new parameter schema and displacement payload ordering

## 12. Recommended Next Refinement

If geometric fidelity becomes more important than implementation simplicity, the next tracer upgrade should be:

1. reconstruct a full bicubic scalar patch per cell
2. resolve ambiguous cells from that patch rather than mainly from heading heuristics
3. march along the continuous contour inside the cell
4. derive tangent and turning angle from the same continuous patch

That is the concrete meaning of the "stricter Cubic Marching Squares" proposal.
