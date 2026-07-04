# LEGO Technic-compatible gear generator

Generates printable STL gears that mesh with real LEGO Technic parts. Gears use
the LEGO gear system (**module 1**), so a generated gear meshes with any other
module-1 gear — including genuine LEGO — at the standard center distance
`(teeth_a + teeth_b) / 16` studs.

## Install

```bash
pip install -r ../requirements.txt
# Linux only, for the GUI: sudo apt install python3-tk
```

## Run the GUI

```bash
python -m generator.gui
```

Pick a teeth count (8 / 16 / 20 / 24 / 40), set thickness in plate units
(1 unit = 3.2 mm), choose a bore type, then **Generate STL…** and save.

## Use from code

```python
from generator import generate_lego_gear, GearParams

mesh = generate_lego_gear(GearParams(teeth=24, thickness_units=1,
                                     bore_type="cross_axle"))
mesh.export("gear.stl")
```

`generate_lego_gear()` is pure geometry — no GUI dependency — so it is easy to
script or batch.

## View / print the STL

- Drag-and-drop into **viewstl.com** or **3dviewer.net** (no install)
- Windows **3D Viewer** / macOS **Preview** (double-click)
- A slicer (**PrusaSlicer / Cura / Bambu Studio**) — also confirms the mesh is
  watertight and printable

## Bore types

| `bore_type`  | Shape             | Fits                        |
|--------------|-------------------|-----------------------------|
| `cross_axle` | plus / `+` shaped | LEGO cross axles (driven)   |
| `pin_hole`   | round             | LEGO pins (free-spinning)   |

## Dimensions and the fit caveat

Verified constants (see `common.py` for sources): 1 stud = 8 mm, 1 plate =
3.2 mm, gear module = 1, pin/axle envelope = 4.8 mm.

**The cross-axle rib width is tune-to-fit.** The exact LDraw primitive was not
reachable at build time, so `AXLE_ARM_WIDTH` uses the 3D-printing community
value (2.0 mm in a 4.8 mm span) plus a `BORE_CLEARANCE` of 0.10 mm. Printers
vary, so dial the clearance in with the **fit gauge** (small bored discs, no
teeth) instead of reprinting whole gears:

```bash
# print this whole sweep on one plate, try a real axle in each
python -m generator.fitgauge --bore-type cross_axle --out ./output/fitgauge
```

This writes `fitgauge_cross_axle_clearance_0.00.stl` … `_0.20.stl` (a sweep
around `BORE_CLEARANCE`). Whichever grips right tells you the value to set:
edit `BORE_CLEARANCE` at the top of `common.py` — the single source of truth
for every LEGO dimension — and every gear inherits it. The gauge bore is
produced by the *same* `bore_profile()` the gears use, so the fit you feel on a
gauge is the fit you get on a gear.

## Layout

```
generator/
  common.py   # constants + 2D profiles + export
  gears.py    # generate_lego_gear(params) -> trimesh.Trimesh (+ validation)
  gui.py      # Tkinter app (no geometry logic)
  presets/    # JSON param sets per standard teeth count
```
