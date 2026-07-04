# Parametric STL Generator

Generate precision mechanical parts with exact tolerances. Each part type is designed with spatial reasoning — snap-fits require precise slot/tab alignment, gears need involute tooth geometry for proper meshing.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

### Snap-Fit Box
Generate a snap-fit assembly with interlocking lid and base:

```bash
python stl_generator.py snapfit \
  --width 50 --depth 50 --height 30 \
  --wall-thickness 2 --tolerance 0.2 \
  --output-dir ./output
```

Outputs:
- `snapfit_base.stl` — box base with snap tabs
- `snapfit_lid.stl` — lid with snap slots

Parameters:
- `--width`, `--depth`, `--height` — box dimensions (mm)
- `--wall-thickness` — wall thickness (mm)
- `--tolerance` — snap-fit clearance (mm) — adjust if pieces don't fit

### Spur Gear
Generate a spur gear with involute tooth profile:

```bash
python stl_generator.py gear \
  --teeth 20 --module 2.0 --bore 8 \
  --output-dir ./output
```

Outputs:
- `gear_20t_2m.stl` — gear with 20 teeth, 2mm module

Parameters:
- `--teeth` — number of teeth
- `--module` — gear module (pitch diameter = teeth × module)
- `--bore` — center bore diameter (mm)

## Design Philosophy

Each part is built with precision in mind:
- Snap-fits use parameterized slot/tab geometry with adjustable tolerance
- Gears use involute profiles for proper gear meshing
- All dimensions are exact and suitable for 3D printing

## Adding New Part Types

1. Create a new file in `generators/`
2. Subclass `PartGenerator`
3. Implement `generate()` method using CadQuery
4. Add parser to `stl_generator.py`

Example:

```python
from generators.base import PartGenerator

class MyPart(PartGenerator):
    def generate(self, output_dir: str) -> list[str]:
        # Use CadQuery to build part
        part = cq.Workplane("XY").box(10, 10, 10)
        output_file = Path(output_dir) / "my_part.stl"
        part.save(str(output_file))
        return [str(output_file)]
```
