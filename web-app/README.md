# Involute Spur Gear Generator — browser

A client-side parametric involute **spur gear** generator. Runs entirely in the
browser (no server), deploys as a static site, and downloads watertight binary
`.stl` files via a browser Blob.

Formerly a LEGO-specific tool; now general-purpose — module and pressure angle
are free inputs and the bore is a plain round hole.

## Run

```bash
npm install
npm run dev            # dev server
npm run build          # static site -> dist/
npm run build:artifact # single self-contained HTML -> dist-artifact/content.html
npm test               # watertightness + dimensional matrix
```

## Parameters — `generateInvoluteGear(params)`

| Param           | Notes                                             |
|-----------------|---------------------------------------------------|
| `module`        | mm per tooth on the pitch circle (typ. 0.5–5)     |
| `teeth`         | integer ≥ 6 (below 6, involute teeth undercut)    |
| `pressureAngle` | degrees, default 20 (14.5° legacy allowed)        |
| `boreDiameter`  | mm, hole diameter (0 = solid centre)              |
| `boreShape`     | `"round"` (default) or `"d_flat"` (D-shaft flat)  |
| `flatDepth`     | mm the flat removes, for `boreShape: "d_flat"`    |
| `hubDiameter`   | 0 = none, or > bore (a boss around the bore)      |
| `hubHeight`     | mm the hub protrudes above the top face (default: `thickness`) |
| `thickness`     | mm                                                |
| `backlash`      | mm tooth-thinning so a printed pair turns free (0 = exact) |
| `profileShift`  | addendum-modification coefficient x, 0–1.2 (0 = exact); see `minProfileShift()` |

**Validation:** `teeth ≥ 6`, `module > 0`, `thickness > 0`, and
`boreDiameter < pitchDiameter − 2·dedendum` (the bore can't cut into the tooth
root). Invalid input throws a typed `GearValidationError`.

## Geometry approach

- **Gear + bore:** the toothed involute outline is a `THREE.Shape`, the round
  bore is a hole on that shape, and it's extruded to `thickness` — a single
  watertight manifold, no 3D boolean.
- **Optional hub:** a boss around the bore, protruding `hubHeight` mm above the
  top face (independent of gear thickness; defaults to `thickness` if omitted,
  for continuity). Built as its own closed shell and merged with the gear
  (each watertight, overlapping) — so the hub needs no CSG either.

- **Matching shaft (`generateShaft`):** a separate download — a round or
  D-flat pole sized to the current bore minus a printing `clearance` (default
  0.2 mm) so it slides in, keeping the flat for a keyed fit. Just an extruded
  bore-shaped profile; watertight, no CSG.

No WASM, no CSG library — the round bore removed the only reason the old LEGO
version needed one.

## 3D preview

`GearPreview` and `MeshPreview` build the renderer/scene/camera/controls
**once** and reuse them; only the mesh geometry is swapped when parameters
change (previously the whole WebGL scene was torn down and rebuilt on every
slider tick, which stuttered on lower-powered devices, phones especially).

Drag to orbit, scroll/pinch to zoom, two-finger trackpad scroll left/right to
pan (`OrbitControls` + a small custom handler in `orbitPan.ts` — OrbitControls'
built-in wheel handler only reads vertical scroll for zoom and silently
ignores a horizontal-only gesture, so a capture-phase `wheel` listener
detects a horizontal-dominant scroll, pans the camera + target along the
camera's local right axis, and stops the event before OrbitControls also
tries to zoom; vertical/diagonal scroll is left completely untouched).
`enablePan` is also on, so real touchscreens get two-finger-drag panning for
free (OrbitControls' default touch mapping). The gear auto-spins in-plane
until you interact with it (single preview) or spins continuously as the
meshing demo (pair preview) — either way, orbit/pan/zoom work at any time.

When a bore is set, `GearPreview` can also render the matching shaft **seated
in the bore** (toggle: "Show shaft seated in the bore"), so the fit is
something you can see before printing, not just numbers you trust. The gear
spins in its own group; the shaft is added directly to the scene (world-fixed)
so it stays put, like a real stationary axle the gear turns on. Both the bore
and the shaft profile are built around the same (0,0) origin in `common.ts` /
`shaft.ts`, and only the Z axis is re-centred for display — so the shaft lands
exactly seated, including the flat orientation on a D-flat bore, with no
separate alignment step needed.

## Profile shift (fixing undercut on small gears)

Below ~17 teeth at 20° (the classic "17-tooth rule" — the exact theoretical
cutoff is 18; 17 needs a negligible ~0.006 residual shift), a standard
involute gear **undercuts**: the cutter carves into the tooth root, leaving a
thin, weak base. `profileShift` (x, the standard addendum-modification
coefficient) counters this — it thickens the tooth base and pushes the tip
out. `minProfileShift(teeth, pressureAngle)` returns the shift that just
eliminates it, and the GUI's **Profile shift** slider shows an "Auto-fix
undercut" button that jumps straight to it whenever `hasUndercut()` is true.

**Single-gear mode only.** A meshing *pair* would need the two shifts to
balance (`x1 + x2`) against a resulting change in operating pressure angle and
centre distance — a materially different, harder problem than shifting one
printed gear. Rather than half-implement that incorrectly, `profileShift` is
scoped to the single-gear generator; gear B in pair mode stays unshifted.

**The tradeoff this surfaces, not hides:** a large shift on a very low tooth
count pushes the addendum out far enough that the tooth tapers to a point
before reaching the nominal outer radius — and past that point the outline
would self-intersect (verified: 7 crossing segments on an unclamped 6-tooth,
module-2, 20° case at the exact recommended shift). `involuteGearOutline`
detects this (`flank(rOut)` going below a minimum topland angle) and clamps
the tip radius via bisection to the largest radius that keeps a real,
non-crossing tip — the same "pointed tooth" limit real gear design applies.
The reported `outerRadius()` stays the nominal formula value; the actual tip
can be smaller once this clamp engages, which is why validated undercut-fix
cases check the tip is `<=` nominal rather than asserting an exact match.

## Presets

Three JSON presets under `src/presets/` (module/teeth/bore/hub combos you
can't get from the old LEGO-locked tool) are wired into a **Presets** dropdown
in the GUI — selecting one fills in every field at once via
`gearParamsFromPreset()`; you can keep tweaking from there. The dropdown
resets to a placeholder after each pick so it always reads as an action, not a
stuck selection.

## Verification (`npm test`)

Swept across the general parameter space, not fixed sizes:

- **module** ∈ {0.5, 1, 1.5, 2, 3, 5} × **teeth** ∈ {6, 8, 12, 17, 20, 40} ×
  **pressure angle** ∈ {14.5°, 20°} — every combination watertight, with the
  correct tip diameter and `pitch diameter = module × teeth`.
- **Hub** watertight, taller than the gear body at the default height, and —
  separately — **hub height** verified to land exactly at `thickness +
  hubHeight` regardless of thickness, so the two are genuinely independent.
- **Validation** errors thrown for teeth < 6, module 0, thickness 0, bore into
  root, hub ≤ bore, hub height ≤ 0, and profile shift outside 0–1.2.
- **`minProfileShift()`** checked against hand-computed values (17t≈0, 6t≈0.649,
  8t≈0.532, 12t≈0.298 at 20°) and `hasUndercut()`'s true/false flip around them.
- **Profile shift widening** verified as an exact match to the predicted
  formula (measured at the root, where the flank angle is shift-invariant of
  the tip radius — see the code comment for why the tip isn't used for this).
  Separately, the **actual undercut-fix path** (recommended shift on 6/8/12
  tooth gears, including the pointed-tip clamp) is verified watertight, no
  longer undercutting, with the tip at-or-under the nominal outer radius.

Also smoke-tested in headless Chromium: the form renders, presets load and
populate every field (confirmed against the computed pitch diameter), the hub
height slider appears/disappears with the hub, dragging teeth to 6 shows the
undercut warning and "Auto-fix undercut" clears it (profile shift jumps to the
recommended ~0.65, confirmed watertight, no console errors), and horizontal
vs. vertical scroll measurably pan vs. zoom respectively (verified by tracking
the gear's on-screen silhouette, not just a raw pixel diff).
