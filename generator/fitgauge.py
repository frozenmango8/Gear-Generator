"""Cross-axle / pin-hole fit gauges: thin bored discs for dialing in clearance.

Print a small sweep of these instead of a whole gear, try a real LEGO part in
each, and read off which clearance grips right. The bore is produced by the
SAME `common.bore_profile()` that gears.py uses, so a gauge's hole is identical
to a real gear's hole at the same clearance.

CLI:  python -m generator.fitgauge --bore-type cross_axle --out ./output/fitgauge
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path

import trimesh
from shapely.geometry import Point

from . import common
from .common import BORE_CLEARANCE, PLATE_MM, export_stl

# Embossed label: raised dots on the top face, count == clearance * 100
# (e.g. 5 dots for 0.05 mm). No font dependency, distinguishable by eye.
LABEL_DOT_RADIUS = 0.5        # mm
LABEL_DOT_PROTRUDE = 0.6      # mm raised above the top face
LABEL_DOT_EMBED = 0.3         # mm sunk into the disc for a clean, watertight union


@dataclass
class FitGaugeParams:
    """Parameters for a single fit gauge (a bored disc, no teeth)."""

    bore_type: str = "cross_axle"          # "cross_axle" | "pin_hole"
    diameter: float = 12.0                 # outer disc diameter (mm)
    thickness_units: float = 1.0           # multiples of PLATE_MM
    clearance_override: float | None = None  # None -> use common.BORE_CLEARANCE
    emboss_label: bool = True              # raised dots encoding the clearance

    @property
    def thickness_mm(self) -> float:
        return self.thickness_units * PLATE_MM

    @property
    def clearance(self) -> float:
        return BORE_CLEARANCE if self.clearance_override is None else self.clearance_override


def label_mark_count(clearance: float) -> int:
    """Number of raised dots that encode a clearance value (clearance * 100)."""
    return max(0, round(clearance * 100))


def _label_radius(params: FitGaugeParams) -> float:
    """Radius at which to place the label dots: clear of the bore and the rim."""
    r_disc = params.diameter / 2.0
    r_bore = common.bore_max_radius(params.bore_type, params.clearance)
    r = (r_bore + r_disc) / 2.0
    r = max(r, r_bore + LABEL_DOT_RADIUS + 0.5)   # keep off the bore/fit area
    r = min(r, r_disc - LABEL_DOT_RADIUS - 0.4)   # keep inside the rim
    return r


def _emboss_label(disc: trimesh.Trimesh, params: FitGaugeParams) -> trimesh.Trimesh:
    """Union raised dots onto the disc's top face encoding clearance * 100."""
    n = label_mark_count(params.clearance)
    if n == 0:
        return disc

    r_label = _label_radius(params)
    height = LABEL_DOT_EMBED + LABEL_DOT_PROTRUDE
    # cylinder base sits LABEL_DOT_EMBED below the top face, tip protrudes above
    z_center = params.thickness_mm - LABEL_DOT_EMBED + height / 2.0

    dots = []
    for i in range(n):
        ang = 2 * math.pi * i / n + math.pi / 2  # start at top, evenly spaced
        dot = trimesh.creation.cylinder(
            radius=LABEL_DOT_RADIUS, height=height, sections=24
        )
        dot.apply_translation(
            (r_label * math.cos(ang), r_label * math.sin(ang), z_center)
        )
        dots.append(dot)

    merged = trimesh.boolean.union([disc, *dots])
    merged.merge_vertices()
    return merged


def generate_fit_gauge(params: FitGaugeParams) -> trimesh.Trimesh:
    """Generate a thin disc with a bore punched through it.

    Raises ValueError if the parameters cannot produce a valid gauge.
    """
    if params.bore_type not in ("cross_axle", "pin_hole"):
        raise ValueError(
            f"Unknown bore type {params.bore_type!r}; use cross_axle or pin_hole."
        )
    if params.diameter <= 0:
        raise ValueError("Diameter must be positive.")
    if params.thickness_units <= 0:
        raise ValueError("Thickness must be a positive number of plate units.")

    # Same bore function gears.py uses — identical geometry, no duplication.
    bore = common.bore_profile(params.bore_type, params.clearance)
    r_bore = common.bore_max_radius(params.bore_type, params.clearance)
    if r_bore >= params.diameter / 2.0:
        raise ValueError(
            f"Bore (r={r_bore:.2f} mm) is larger than the disc "
            f"(r={params.diameter / 2.0:.2f} mm). Increase diameter."
        )

    disc = Point(0, 0).buffer(params.diameter / 2.0, resolution=96)
    section = disc.difference(bore)

    mesh = trimesh.creation.extrude_polygon(section, height=params.thickness_mm)
    mesh.merge_vertices()

    if params.emboss_label:
        mesh = _emboss_label(mesh, params)

    if not mesh.is_watertight:
        raise ValueError("Internal error: fit gauge mesh is not watertight.")
    return mesh


def _fmt(value: float) -> str:
    """Filename-safe 2-decimal string, e.g. 0.05 or -0.05."""
    return f"{value:.2f}"


def clearance_sweep(
    bore_type: str = "cross_axle",
    output_dir: str = "./output/fitgauge",
    offsets: list[float] | None = None,
    diameter: float = 12.0,
    thickness_units: float = 1.0,
) -> list[tuple[float, str]]:
    """Generate a set of gauges sweeping clearance around common.BORE_CLEARANCE.

    Each offset is added to BORE_CLEARANCE. Returns [(clearance, path), ...].
    Files are named e.g. fitgauge_cross_axle_clearance_0.05.stl so a whole
    plate can be printed and compared at a glance.
    """
    if offsets is None:
        offsets = [-0.10, -0.05, 0.0, 0.05, 0.10]

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    results: list[tuple[float, str]] = []
    for off in offsets:
        clearance = round(BORE_CLEARANCE + off, 4)
        params = FitGaugeParams(
            bore_type=bore_type,
            diameter=diameter,
            thickness_units=thickness_units,
            clearance_override=clearance,
        )
        mesh = generate_fit_gauge(params)
        path = out / f"fitgauge_{bore_type}_clearance_{_fmt(clearance)}.stl"
        export_stl(mesh, str(path))
        results.append((clearance, str(path)))
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate LEGO cross-axle / pin-hole fit gauges."
    )
    parser.add_argument(
        "--bore-type",
        choices=["cross_axle", "pin_hole"],
        default=None,
        help="Bore type. Omit (or pass --both) to generate both in one run.",
    )
    parser.add_argument(
        "--both",
        action="store_true",
        help="Generate both cross_axle and pin_hole sweeps in one invocation",
    )
    parser.add_argument("--out", default="./output/fitgauge", help="Output directory")
    parser.add_argument("--diameter", type=float, default=12.0, help="Disc diameter (mm)")
    parser.add_argument(
        "--thickness", type=float, default=1.0, help="Thickness in plate units"
    )
    parser.add_argument(
        "--offsets",
        default="-0.1,-0.05,0,0.05,0.1",
        help="Comma-separated clearance offsets around BORE_CLEARANCE",
    )
    parser.add_argument(
        "--single",
        action="store_true",
        help="Generate one gauge at the default clearance instead of a sweep",
    )
    args = parser.parse_args(argv)

    # No bore type given, or --both -> do both. Otherwise just the one named.
    if args.both or args.bore_type is None:
        bore_types = ["cross_axle", "pin_hole"]
    else:
        bore_types = [args.bore_type]

    if args.single:
        Path(args.out).mkdir(parents=True, exist_ok=True)
        for bore in bore_types:
            params = FitGaugeParams(
                bore_type=bore,
                diameter=args.diameter,
                thickness_units=args.thickness,
            )
            mesh = generate_fit_gauge(params)
            path = Path(args.out) / f"fitgauge_{bore}_clearance_{_fmt(params.clearance)}.stl"
            export_stl(mesh, str(path))
            print(f"Wrote {path}  ({label_mark_count(params.clearance)} dots)")
        return 0

    offsets = [float(x) for x in args.offsets.split(",")]
    for bore in bore_types:
        results = clearance_sweep(
            bore_type=bore,
            output_dir=args.out,
            offsets=offsets,
            diameter=args.diameter,
            thickness_units=args.thickness,
        )
        print(f"Wrote {len(results)} {bore} fit gauges to {args.out}:")
        for clearance, path in results:
            print(
                f"  clearance {clearance:+.2f} mm  "
                f"({label_mark_count(clearance):2d} dots)  ->  {Path(path).name}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
