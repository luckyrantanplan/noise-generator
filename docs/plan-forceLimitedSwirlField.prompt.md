## Historical Note

This document describes an obsolete planning path for the removed swirl-based generator.

The active implementation no longer uses force-limited swirls.
It now uses a scalar-field isoline tracer with `maxTraceLength` and `targetTurnAngleDegrees`.

See /home/florian/copilotTest/noise_generator/docs/specification.md for the current algorithm.

## Plan: Force-Limited Swirl Field

Redefine `force` as the maximum permitted displacement magnitude in SVG/world units without using a final post-composition clamp. The recommended implementation is: 1) switch swirl placement to non-overlapping radius-aware packing so multiple swirls cannot stack at one point, 2) compute an exact worst-case swirl chord bound from the current envelope and clamp the effective swirl strength against `force`, 3) treat `force` as a shared vector budget that is jointly allocated between swirl and noise with a mild swirl preference instead of a pure residual-budget rule, and 4) bump the binary version so older exports are intentionally rejected instead of being silently reinterpreted.

**Steps**

1. Phase 1: Move the active swirl placement path from `/home/florian/copilotTest/noise_generator/src/field/poissonDisk.ts` to `/home/florian/copilotTest/noise_generator/src/field/variousDiskPacking.ts` for actual swirl-center generation. Keep the public `swirlDensity` meaning as an approximate density control, but derive a target disk count from it and place fixed-radius disks with `packDisks(...)` so swirl supports do not overlap.
2. Adapt `/home/florian/copilotTest/noise_generator/src/field/variousDiskPacking.ts` to support deterministic generation by injecting the seeded random source currently used by `sampleSwirlCenters(...)`. Reuse the existing `SeededRandom` instance from `/home/florian/copilotTest/noise_generator/src/field/composeField.ts` or a small random callback interface so packed swirls remain reproducible from `randomSeed`.
3. Pack in aspect-correct physical space rather than raw normalized coordinates so circular swirl supports stay isotropic on rectangular renders. The implementation should use the same short-side metric convention already used by `/home/florian/copilotTest/noise_generator/src/field/grid.ts` and `/home/florian/copilotTest/noise_generator/src/field/swirls.ts`, then map packed disk centers back to normalized `SwirlCenter.positionX` and `positionY`.
4. Keep `/home/florian/copilotTest/noise_generator/src/field/poissonDisk.ts` only as a density/radius helper if useful, or retire its placement logic entirely once `variousDiskPacking.ts` owns swirl placement. The important scope boundary is that force enforcement must not remain in the unused helper path.
5. Phase 2: Add a shared swirl-bound helper in `/home/florian/copilotTest/noise_generator/src/field/swirls.ts` or a small new helper module under `/home/florian/copilotTest/noise_generator/src/field/`. Reuse the current `swirlAngleEnvelope(...)` math to compute the real worst-case reachable chord for a swirl with radius `R`, strength `theta`, and `swirlFalloff`. The bound should reflect the current envelope, not the simplified literal formula, so the effective maximum is based on the true largest value of `2 * u * R * sin(|theta * envelope(u)| / 2)` over normalized radius `u`.
6. Add the inverse normalization step that computes the maximum allowed angle budget for each sampled swirl radius under the current `force` and `swirlFalloff`, then resolve `swirlStrengthPercent` against that per-swirl budget. The implementation must keep the worst-case chord within `force` for every sampled swirl.
7. Phase 3: Apply that normalization in `/home/florian/copilotTest/noise_generator/src/shared/params.ts` after the independent numeric clamps so user input, URLs, and server requests all produce internally consistent parameters. Keep the key name `force`, but update its description to mean both the maximum background-noise magnitude and the maximum permitted vector length.
8. Add the same normalization defensively in `/home/florian/copilotTest/noise_generator/src/field/composeField.ts` before swirl sampling and influence evaluation so direct programmatic callers cannot bypass the bound by constructing `ParameterValues` manually.
9. Re-tune defaults and exposed ranges in `/home/florian/copilotTest/noise_generator/src/shared/params.ts` so the out-of-the-box parameter set already satisfies the new invariant without relying on hidden runtime clamping. This review should include `DEFAULT_PARAMETERS.force`, `DEFAULT_PARAMETERS.swirlMinimumAngleDegrees`, `DEFAULT_PARAMETERS.swirlStrengthPercent`, `MAX_FORCE`, and the `Swirl Strength` description, because current defaults do not satisfy the new force/swirl relationship.
10. Phase 4: Update `/home/florian/copilotTest/noise_generator/src/field/composeField.ts` so `force` is treated as a shared vector budget rather than a residual one. Keep the current noise direction/amplitude generation and the new force-limited swirl term, but when both are present at a cell, derive joint scale factors for the swirl vector and the already-attenuated noise vector so the final composed vector stays within `force` while preserving a mild swirl preference.
11. Recommended composition rule: make the 60/40 split a soft per-cell preference, not a hard cap. Let `s0` be the requested swirl vector after the single-swirl force limit, let `n0` be the requested noise vector after the existing `directionNoiseMix` attenuation, let `a = |s0|`, `b = |n0|`, and let `v0 = s0 + n0`. If `|v0| <= force`, keep the requested vectors unchanged. Otherwise, when both contributors are materially present, recommend using the target shares `ts = 0.6` and `tn = 0.4`, the requested swirl share `qs = a / (a + b)`, and an overload factor `lambda = clamp((|v0| - force) / force, 0, 1)`. Then set the soft target shares to `ps = (1 - lambda) * qs + lambda * ts` and `pn = 1 - ps`, allocate provisional magnitude budgets `As = min(a, ps * force)` and `An = min(b, pn * force)`, and rebuild the vectors as `s = (As / a) * s0` and `n = (An / b) * n0` when the corresponding magnitude is non-zero. This keeps the requested balance when the field is only mildly over budget, and smoothly steers it toward 60/40 as overload increases.
12. To avoid needlessly weakening near-pure swirl or near-pure noise regions, treat the 60/40 rule as active only when both contributors are materially present; recommended threshold: `min(a, b) >= 0.1 * force`. If one contributor is below that threshold, preserve the weaker contributor as requested and give the stronger contributor the remaining admissible magnitude budget. Because packed swirls do not overlap, the per-cell swirl term will come from at most one swirl support. That removes the current additive-swirl overrun risk and makes this joint two-component allocator mathematically sufficient without a post-hoc clamp, since `|s + n| <= |s| + |n| <= As + An <= force`.
13. Phase 5: Update user-facing semantics in `/home/florian/copilotTest/noise_generator/src/shared/params.ts`, `/home/florian/copilotTest/noise_generator/src/client/index.ts`, and `/home/florian/copilotTest/noise_generator/docs/specification.md`. The UI should communicate that `force` is the maximum allowed vector length, and `swirlStrengthPercent` should indicate the requested percentage of the currently allowed angle budget.
14. Keep `swirlStrengthPercent` uncoupled in the UI and resolve it in the generator pipeline instead of pushing coupled-parameter logic into the page.
15. Phase 6: Intentionally break binary compatibility by bumping `/home/florian/copilotTest/noise_generator/src/shared/displacementBinary.ts` from version 1 to a new version and rejecting old binaries. This matches the accepted decision that old exports can become unreadable rather than be silently regenerated under new force semantics.
16. Update `/home/florian/copilotTest/noise_generator/src/server/exportBinary.ts`, `/home/florian/copilotTest/noise_generator/src/client/index.ts`, and any affected tests so export/import use the new versioned semantics cleanly.
17. Phase 7: Rewrite and extend the focused regression coverage. Replace tests that currently lock in “force affects noise only” behavior, add direct checks that final vector magnitudes never exceed `force`, add bound tests for derived swirl-strength normalization, add non-overlap placement tests for the new `variousDiskPacking.ts`-backed swirl sampler, and add binary-version rejection tests.

**Relevant files**

- `/home/florian/copilotTest/noise_generator/src/field/variousDiskPacking.ts` — become the active deterministic non-overlapping swirl placement backend; add seeded randomness support and aspect-correct packing behavior.
- `/home/florian/copilotTest/noise_generator/src/field/poissonDisk.ts` — either retain density helper logic or remove obsolete placement code after the handoff to `variousDiskPacking.ts`.
- `/home/florian/copilotTest/noise_generator/src/field/composeField.ts` — normalize effective parameters for direct callers and replace simple additive composition with joint swirl/noise budget allocation under the force cap.
- `/home/florian/copilotTest/noise_generator/src/field/swirls.ts` — expose the exact worst-case chord computation and any shared helper needed to resolve `swirlStrengthPercent` against the force-limited angle budget.
- `/home/florian/copilotTest/noise_generator/src/shared/params.ts` — update parsing, defaults, ranges, and descriptions for `force`, `swirlMinimumAngleDegrees`, `swirlStrengthPercent`, and related controls.
- `/home/florian/copilotTest/noise_generator/src/client/index.ts` — keep the UI synchronized with the derived swirl-strength ceiling and the new force wording.
- `/home/florian/copilotTest/noise_generator/src/shared/types.ts` — keep the parameter model stable if possible; only update comments or metadata contracts if needed.
- `/home/florian/copilotTest/noise_generator/src/shared/displacementBinary.ts` — bump binary version and reject old exports.
- `/home/florian/copilotTest/noise_generator/src/server/exportBinary.ts` — export the new binary version/metadata path.
- `/home/florian/copilotTest/noise_generator/docs/specification.md` — rewrite the force and swirl-generation sections so they match the no-final-clamp, soft 60/40 joint-budget composition, and exact worst-case bound.
- `/home/florian/copilotTest/noise_generator/test/field.test.ts` — replace old force/swirl assumptions and add bound and non-overlap regressions.
- `/home/florian/copilotTest/noise_generator/test/displacementBinary.test.ts` — add version-bump coverage and rejection of old binaries.
- `/home/florian/copilotTest/noise_generator/test/server.test.ts` — verify endpoint behavior still matches the new semantics and binary version.
- `/home/florian/copilotTest/noise_generator/test/variousDiskPacking.test.ts` — extend coverage from standalone packing behavior to the deterministic seeded placement contract expected by swirl generation.

**Verification**

1. Run `npm run build` after the parameter-normalization and composition changes.
2. Run `npm test` and confirm updated field tests assert `magnitude[i] <= force` for generated fields, without relying on a final clamp.
3. Add a focused test proving that a larger sampled swirl radius reduces the resolved attainable angle under fixed `force`, even while `swirlStrengthPercent` stays uncoupled.
4. Add a focused test proving that packed swirls do not overlap in aspect-correct metric space, so multiple swirl supports cannot sum at one grid cell.
5. Add a focused test proving that when swirl and noise would exceed the force cap together, the per-cell allocator behaves as a soft 60/40 preference: it preserves the requested ratio when only mildly overloaded, steers toward 60/40 under stronger overload, and falls back to preserving the weaker contributor when one side is below the material-presence threshold.
6. Add a focused test proving that binary version 1 files are rejected after the version bump.
7. Run one end-to-end SVG render check to confirm arrows and heatmap still reflect the new capped magnitudes and that default parameters no longer start in an already-invalid state.

**Decisions**

- `force` is a true maximum displacement length in SVG/world units and must hold for the final generated field.
- No final hard post-composition clamp is allowed; enforcement must happen through placement, parameter normalization, and joint swirl/noise budget allocation during composition.
- When swirl and noise compete for the same force budget, the composition should use a soft per-cell 60/40 preference in favor of swirl, not a hard per-cell cap. Recommended rule: blend from the requested local ratio toward 60/40 as overload increases, and only activate that rule when both contributors are materially present.
- The swirl bound must use the real worst-case chord reachable by the current radial envelope, not the simplified literal `2 * R * sin(theta / 2)` formula when that formula underestimates the current implementation.
- Old binary exports may become unreadable; the correct behavior is an explicit binary version break, not silent reinterpretation.
- `variousDiskPacking.ts` should become part of the active swirl-generation path because non-overlap is necessary to guarantee the force bound without a final clamp.

**Scope boundaries**

- Included: force semantic change, exact swirl-bound enforcement, non-overlapping swirl placement, joint swirl/noise budget composition, parameter/UI/docs alignment, and binary version break.
- Excluded: redesigning the FFT/spectral noise pipeline, preserving backward compatibility for old binaries, or a broader frontend layout rewrite.

**Further Considerations**

1. The exact swirl-strength cap can be implemented analytically if you derive a closed form for the current envelope, but a shared numerical maximization/inversion helper is acceptable if it is deterministic, cheap, and covered by tests.
2. If the team wants to preserve the old “many overlapping swirls” visual density, that would require a different composition contract or a sanctioned final clamp; with the current decision set, non-overlap is the cleanest route.
3. If dynamic client-side slider max updates are too invasive, a smaller fallback is to keep the static slider range but immediately clamp and echo the effective value after every refresh. The stronger recommendation is still live synchronization so the UI explains the constraint instead of surprising the user.
