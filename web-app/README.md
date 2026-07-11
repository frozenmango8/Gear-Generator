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

Drag to orbit, scroll/pinch to zoom (`OrbitControls`, damped, panning
disabled). The gear auto-spins in-plane until you interact with it (single
preview) or spins continuously as the meshing demo (pair preview) — either
way, orbiting works at any time.

When a bore is set, `GearPreview` can also render the matching shaft **seated
in the bore** (toggle: "Show shaft seated in the bore"), so the fit is
something you can see before printing, not just numbers you trust. The gear
spins in its own group; the shaft is added directly to the scene (world-fixed)
so it stays put, like a real stationary axle the gear turns on. Both the bore
and the shaft profile are built around the same (0,0) origin in `common.ts` /
`shaft.ts`, and only the Z axis is re-centred for display — so the shaft lands
exactly seated, including the flat orientation on a D-flat bore, with no
separate alignment step needed.

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
  root, hub ≤ bore, and hub height ≤ 0.

Also smoke-tested in headless Chromium: the form renders, presets load and
populate every field (confirmed against the computed pitch diameter), the hub
height slider appears/disappears with the hub, and no console errors are
thrown while driving the controls.
