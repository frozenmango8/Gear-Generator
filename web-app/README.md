# Involute Spur Gear Generator — browser

A client-side parametric involute **spur gear** generator, plus a **straight
bevel gear** mode for shafts that meet at 90°. Runs entirely in the browser
(no server), deploys as a static site, and downloads watertight binary `.stl`
files via a browser Blob.

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

## Bevel gears (90° shafts) — `generateBevelGear(params)`

**Bevel pair (90°)** mode generates two **straight bevel gears** whose shafts
meet at a right angle, via **Tredgold's approximation** — the standard
technique for 3D-printable straight bevel teeth (used by most OpenSCAD/CAD
bevel generators too).

| Param          | Notes                                                        |
|----------------|---------------------------------------------------------------|
| `teeth`        | this gear's real, integer tooth count (≥ 6)                   |
| `matingTeeth`  | the mate's tooth count — together they set both pitch angles (`atan2(teeth, matingTeeth)` and its complement, always summing to 90°) |
| `module`       | shared by both gears, same convention as the spur module      |
| `faceWidth`    | axial depth of the tooth band, out from the shared cone apex (default: outer cone distance / 3) |
| `pressureAngle`, `boreDiameter`, `boreShape`, `flatDepth`, `backlash` | same meaning as the spur generator |

**How the tooth shape is built:** each gear's tooth profile is computed as an
equivalent spur-gear tooth at a *virtual* (back-cone) tooth count
`teeth / cos(gamma)` — a standard substitution that gives the flank the
correct involute curvature for a cone instead of a cylinder — then mapped onto
the gear's real physical size and its real, integer tooth count. The tapered
3D tooth is a straight loft between that cross-section at the outer (large)
end and a uniformly-scaled copy at the inner end, `faceWidth` further in along
the axis — the standard simplification for **straight** (non-spiral) bevel
teeth, whose flanks are straight lines from the cone apex.

**Scope, stated plainly:** 90° shaft angle only (no arbitrary bevel angle),
straight teeth (no spiral/hypoid), no hub, and no profile shift (a meshing
pair's shift would need to balance against a changed operating pressure angle
— the same reason it's out of scope for the parallel-shaft *meshing pair*
mode too). The 3D preview (`BevelPreview`) is a **static assembly**, not a
meshing simulation — true bevel-tooth contact kinematics vary along the cone
and are a materially harder problem than the parallel-shaft counter-rotation
case, so rather than fake it, the pair auto-spins as one rigid body when idle
(presentation only) and stops the moment you orbit/pan/zoom it yourself.

**Two real bugs found and fixed while building this** (both caught by
rendering the actual mesh, not just checking the numbers — `isWatertight()`
and a positive `signedVolume()` both kept passing while these were present):

- **Angular mapping.** The virtual tooth's own angular width
  (`2π / zVirtual`) doesn't match the real gear's tooth spacing
  (`2π / teeth`) — they differ by exactly `cos(gamma)`. Naively scaling each
  point's *radius* by `cos(gamma)` while leaving its *angle* unchanged (as an
  earlier version of this code did) replicates a tooth cell that's narrower
  than the slot it's placed in, tearing gaps into the outline between teeth.
  Fixed by also scaling each point's angle by `1 / cos(gamma)` — the same
  "developed cone" substitution that motivates using a virtual tooth count in
  the first place, applied consistently to the whole flank rather than just
  its radius.
- **Triangle winding.** The hand-built loft (side walls + end caps — this
  shape isn't a constant cross-section, so `THREE.ExtrudeGeometry` doesn't
  apply) had the *bore* wall's triangles wound backwards relative to the rest
  of the mesh. `isWatertight()` (every edge shared by exactly two triangles)
  and a net-positive `signedVolume()` both stayed green through this, because
  neither check is sensitive to a *local* winding flip — the backwards patch
  just partially cancelled the volume integral without flipping its sign.
  It only showed up as backface-culling holes in the WebGL preview from
  certain angles (readable as thin "spikes" through the gap to geometry
  behind it) and would have handed a slicer a non-manifold-normals STL.
  Found by checking that every directed edge (`a→b` within a triangle) has
  exactly one opposite-direction partner (`b→a`) on the neighboring triangle
  — a stricter test than either check above — now a permanent part of the
  bevel test suite (`isConsistentlyWound()`).

The same debugging also surfaced a latent, pre-existing issue in the shared
single-tooth outline code (`singleToothOutline` in `common.ts`): the root arc
was drawn at the raw `rootRadius()` formula value instead of
`min(rootRadius(), baseRadius())`, which is where the flank curve's own
innermost point actually lands. Once `rootRadius() > baseRadius()` — routine
for a bevel gear's large virtual tooth count, and in principle possible for
an ordinary spur gear around 42+ teeth at module 1, 20° — this created a
discontinuity that could self-intersect the outline when combined with the
pointed-tip clamp. Fixed for both spur and bevel gears by the same one-line
change; the full spur-gear regression matrix (module × teeth × pressure angle)
still passes unchanged.

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

- **Bevel gears:** pitch angles sum to 90° and both gears share the same
  outer cone distance, across several teeth-ratio/module combinations;
  watertight + correctly-wound (positive `signedVolume()` *and*
  `isConsistentlyWound()`, see above) across a teeth-ratio × module × bore
  sweep, including the extreme ratio (40t meshing with 8t) that originally
  exposed the angular-mapping bug; bore validation matching
  `bevelMaxBoreDiameter()` exactly at the boundary; and the full set of
  validation errors (teeth/module/face-width/bore/flat-depth).

Also smoke-tested in headless Chromium: the form renders, presets load and
populate every field (confirmed against the computed pitch diameter), the hub
height slider appears/disappears with the hub, dragging teeth to 6 shows the
undercut warning and "Auto-fix undercut" clears it (profile shift jumps to the
recommended ~0.65, confirmed watertight, no console errors), and horizontal
vs. vertical scroll measurably pan vs. zoom respectively (verified by tracking
the gear's on-screen silhouette, not just a raw pixel diff).
