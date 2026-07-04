"""Cross-axle / pin-hole fit gauges: thin bored discs for dialing in clearance.

Print a small sweep of these instead of a whole gear, try a real LEGO part in
each, and read off which clearance grips right. The bore is produced by the
SAME `common.bore_profile()` that gears.py uses, so a gauge's hole is identical
to a real gear's hole at the same clearance.

CLI:  python -m generator.fitgauge --bore-type cross_axle --out ./output/fitgauge
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import trimesh
from shapely.geometry import Point

from . import common
from .common import BORE_CLEARANCE, PLATE_MM, export_stl


@dataclass
class FitGaugeParams:
    """Parameters for a single fit gauge (a bored disc, no teeth)."""

    bore_type: str = "cross_axle"          # "cross_axle" | "pin_hole"
    diameter: float = 12.0                 # outer disc diameter (mm)
    thickness_units: float = 1.0           # multiples of PLATE_MM
    clearance_override: float | None = None  # None -> use common.BORE_CLEARANCE

    @property
    def thickness_mm(self) -> float:
        return self.thickness_units * PLATE_MM

    @property
    def clearance(self) -> float:
        return BORE_CLEARANCE if self.clearance_override is None else self.clearance_override


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
        "--bore-type", choices=["cross_axle", "pin_hole"], default="cross_axle"
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

    if args.single:
        params = FitGaugeParams(
            bore_type=args.bore_type,
            diameter=args.diameter,
            thickness_units=args.thickness,
        )
        mesh = generate_fit_gauge(params)
        Path(args.out).mkdir(parents=True, exist_ok=True)
        path = Path(args.out) / f"fitgauge_{args.bore_type}_clearance_{_fmt(params.clearance)}.stl"
        export_stl(mesh, str(path))
        print(f"Wrote {path}")
        return 0

    offsets = [float(x) for x in args.offsets.split(",")]
    results = clearance_sweep(
        bore_type=args.bore_type,
        output_dir=args.out,
        offsets=offsets,
        diameter=args.diameter,
        thickness_units=args.thickness,
    )
    print(f"Wrote {len(results)} fit gauges to {args.out}:")
    for clearance, path in results:
        print(f"  clearance {clearance:+.2f} mm  ->  {Path(path).name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
