"""Snap-fit box generator for precision assemblies."""

import cadquery as cq
from pathlib import Path
from .base import PartGenerator


class SnapFitBox(PartGenerator):
    """Generate a snap-fit box with interlocking lid and base."""

    def __init__(
        self,
        width: float = 50,
        depth: float = 50,
        height: float = 30,
        wall_thickness: float = 2,
        tolerance: float = 0.2,
    ):
        self.width = width
        self.depth = depth
        self.height = height
        self.wall = wall_thickness
        self.tolerance = tolerance
        self.snap_height = 4
        self.snap_width = 3

    def _create_base(self) -> cq.Workplane:
        """Create the box base with snap-fit tabs."""
        base = (
            cq.Workplane("XY")
            .box(self.width, self.depth, self.height, centered=True)
            .edges("|Z")
            .chamfer(0.5)
        )

        base_inner = (
            cq.Workplane("XY")
            .box(
                self.width - 2 * self.wall,
                self.depth - 2 * self.wall,
                self.height - self.wall,
                centered=True,
            )
            .translate((0, 0, -self.wall / 2))
        )

        base = base.cut(base_inner)

        snap_tab = (
            cq.Workplane("XY")
            .box(self.snap_width, self.snap_width, self.snap_height, centered=True)
            .translate((0, 0, self.height / 2 + self.snap_height / 2))
        )

        for x in [-self.width / 2 + 5, self.width / 2 - 5]:
            for y in [-self.depth / 2 + 5, self.depth / 2 - 5]:
                base = base.union(snap_tab.translate((x, y, 0)))

        return base

    def _create_lid(self) -> cq.Workplane:
        """Create the box lid with snap-fit slots."""
        lid = (
            cq.Workplane("XY")
            .box(self.width + self.wall, self.depth + self.wall, self.wall, centered=True)
            .edges("|Z")
            .chamfer(0.5)
        )

        snap_slot = (
            cq.Workplane("XY")
            .box(
                self.snap_width + 2 * self.tolerance,
                self.snap_width + 2 * self.tolerance,
                self.snap_height + self.tolerance,
                centered=True,
            )
            .translate((0, 0, -self.wall / 2))
        )

        for x in [-self.width / 2 + 5, self.width / 2 - 5]:
            for y in [-self.depth / 2 + 5, self.depth / 2 - 5]:
                lid = lid.cut(snap_slot.translate((x, y, 0)))

        return lid

    def generate(self, output_dir: str) -> list[str]:
        """Generate snap-fit box STL files."""
        output_path = Path(output_dir)

        base = self._create_base()
        base_file = output_path / "snapfit_base.stl"
        cq.exporters.export(base, str(base_file))

        lid = self._create_lid()
        lid_file = output_path / "snapfit_lid.stl"
        cq.exporters.export(lid, str(lid_file))

        return [str(base_file), str(lid_file)]
