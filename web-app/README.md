# LEGO Gear Generator — browser (TypeScript port)

A client-side port of the Python `generator/` package. Runs entirely in the
browser (no server), so it deploys as a static site. Generates the same
verified module-1 LEGO gears and cross-axle/pin-hole fit gauges, and downloads
watertight binary `.stl` files via a browser Blob.

## Run

```bash
npm install
npm run dev       # dev server
npm run build     # static site -> dist/ (deploy anywhere static)
npm run preview   # serve the built dist/
npm test          # watertightness + dimension + validation matrix
```

## What was ported, and how it maps

| Python (trimesh)                | TypeScript (this port)                          |
|--------------------------------|-------------------------------------------------|
| `common.py` constants          | `src/common.ts` — every constant 1:1            |
| `bore_profile()` (shared)      | `boreProfile()` — shared by gears **and** gauge |
| shapely 2D `.difference()`     | `THREE.Shape` + hole path → `ExtrudeGeometry`   |
| `trimesh.boolean.union` (labels)| `manifold-3d` (WASM) via `src/csg.ts`          |
| `mesh.export()`                | `STLExporter` → Blob download (`src/stl.ts`)    |
| Tkinter GUI                    | React form (`src/gui.tsx`), same fields/messages|

## Two decisions worth knowing

**1. The bore is a 2D hole, not 3D CSG.** The Python subtracts the bore with a
2D shapely `.difference()` before extruding — so the faithful port builds a
`THREE.Shape` with a hole and extrudes it. This is watertight by construction
and needs no 3D boolean for the gear. (The plus bore is still a genuine
subtracted plus-shape — just in 2D, exactly like the source.)

**2. The label union uses `manifold-3d`, not the usual three CSG libs.** The
fit-gauge dot labels are the one place a 3D boolean is needed. Both libraries
the brief suggested failed the watertight test here:

| library         | open boundary edges on the 5-dot union |
|-----------------|----------------------------------------|
| three-bvh-csg   | 174 (not watertight)                   |
| three-csg-ts    | 1025 (not watertight)                  |
| **manifold-3d** | **0 (watertight)**                     |

`manifold-3d` is the WASM build of the same `manifold3d` engine trimesh used in
Python, so it guarantees manifold output and matches the Python result exactly.
WASM init is async — `await initManifold()` once before generating labeled
gauges (the GUI does this on the fit-gauge button).

## Verification (`npm test`)

The same matrix the Python port was held to, re-checked independently here:

- **Gears:** 5 teeth (8/16/20/24/40) × 2 bores (cross_axle/pin_hole) — all
  watertight, correct outer diameter (`teeth + 2 mm`), bore actually subtracted.
- **Fit gauges:** both bores × full clearance sweep — all watertight after the
  manifold label union; dot count matches `clearance × 100` by measured volume.
- **Validation:** bad teeth count, thickness ≤ 0, and bore/root collision throw
  typed `GearValidationError`s with the same messages as Python.

Also smoke-tested in headless Chromium: the page renders, gears generate and
download, and the manifold WASM path runs in-browser (the fit-gauge sweep
downloads successfully).
