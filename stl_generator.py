#!/usr/bin/env python3
"""Parametric STL generator for precision mechanical parts."""

import argparse
import sys
from pathlib import Path
from generators.snapfit import SnapFitBox
from generators.gear import SimpleGear


def main():
    parser = argparse.ArgumentParser(
        description="Generate precision mechanical STL files"
    )
    subparsers = parser.add_subparsers(dest="type", help="Part type to generate")

    # Snap-fit box
    snapfit_parser = subparsers.add_parser(
        "snapfit", help="Generate snap-fit box assembly"
    )
    snapfit_parser.add_argument(
        "--width", type=float, default=50, help="Box width (mm)"
    )
    snapfit_parser.add_argument(
        "--depth", type=float, default=50, help="Box depth (mm)"
    )
    snapfit_parser.add_argument(
        "--height", type=float, default=30, help="Box height (mm)"
    )
    snapfit_parser.add_argument(
        "--wall-thickness", type=float, default=2, help="Wall thickness (mm)"
    )
    snapfit_parser.add_argument(
        "--tolerance", type=float, default=0.2, help="Snap-fit tolerance (mm)"
    )
    snapfit_parser.add_argument(
        "--output-dir",
        type=str,
        default="./output",
        help="Output directory for STL files",
    )

    # Simple gear
    gear_parser = subparsers.add_parser("gear", help="Generate simple spur gear")
    gear_parser.add_argument(
        "--teeth", type=int, default=20, help="Number of teeth"
    )
    gear_parser.add_argument(
        "--module", type=float, default=2.0, help="Gear module (mm)"
    )
    gear_parser.add_argument(
        "--bore", type=float, default=8, help="Center bore diameter (mm)"
    )
    gear_parser.add_argument(
        "--output-dir",
        type=str,
        default="./output",
        help="Output directory for STL files",
    )

    args = parser.parse_args()

    if not args.type:
        parser.print_help()
        return 1

    Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    if args.type == "snapfit":
        generator = SnapFitBox(
            width=args.width,
            depth=args.depth,
            height=args.height,
            wall_thickness=args.wall_thickness,
            tolerance=args.tolerance,
        )
        files = generator.generate(args.output_dir)
        print(f"Generated snap-fit box: {', '.join(files)}")

    elif args.type == "gear":
        generator = SimpleGear(
            teeth=args.teeth, module=args.module, bore=args.bore
        )
        files = generator.generate(args.output_dir)
        print(f"Generated gear: {', '.join(files)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
