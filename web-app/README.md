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
| `thickness`     | mm                                                |

**Validation:** `teeth ≥ 6`, `module > 0`, `thickness > 0`, and
`boreDiameter < pitchDiameter − 2·dedendum` (the bore can't cut into the tooth
root). Invalid input throws a typed `GearValidationError`.

## Geometry approach

- **Gear + bore:** the toothed involute outline is a `THREE.Shape`, the round
  bore is a hole on that shape, and it's extruded to `thickness` — a single
  watertight manifold, no 3D boolean.
- **Optional hub:** a boss around the bore, **as tall as the gear** and
  protruding one gear-thickness above the top face. It's built as its own
  closed shell and merged with the gear (each watertight, overlapping) — so
  the hub needs no CSG either. (Hub height is currently fixed at one gear
  thickness; easy to expose as a parameter.)

No WASM, no CSG library — the round bore removed the only reason the old LEGO
version needed one.

## Verification (`npm test`)

Swept across the general parameter space, not fixed sizes:

- **module** ∈ {0.5, 1, 1.5, 2, 3, 5} × **teeth** ∈ {6, 8, 12, 17, 20, 40} ×
  **pressure angle** ∈ {14.5°, 20°} — every combination watertight, with the
  correct tip diameter and `pitch diameter = module × teeth`.
- **Hub** cases watertight and taller than the gear body.
- **Validation** errors thrown for teeth < 6, module 0, thickness 0, bore into
  root, and hub ≤ bore.

Also smoke-tested in headless Chromium: the form renders, all five sliders and
the pressure-angle toggle drive the live 3D preview.
