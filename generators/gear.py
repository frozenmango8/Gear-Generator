"""Spur gear generator with involute profile."""

import math
import cadquery as cq
from pathlib import Path
from .base import PartGenerator


class SimpleGear(PartGenerator):
    """Generate a spur gear with involute tooth profile."""

    def __init__(self, teeth: int = 20, module: float = 2.0, bore: float = 8):
        self.teeth = teeth
        self.module = module
        self.bore = bore
        self.thickness = 10

    def _involute_profile(self, t: float) -> tuple[float, float]:
        """Calculate involute curve point (pressure angle = 20°)."""
        pressure_angle = math.radians(20)
        x = math.cos(pressure_angle) + pressure_angle * math.sin(pressure_angle)
        y = math.sin(pressure_angle) - pressure_angle * math.cos(pressure_angle)
        return (x * t, y * t)

    def _create_tooth_profile(self) -> cq.Workplane:
        """Create a single tooth using involute geometry."""
        pitch_radius = self.module * self.teeth / 2
        base_radius = pitch_radius * math.cos(math.radians(20))
        addendum = self.module
        dedendum = 1.25 * self.module

        points = []
        for i in range(20):
            t = i / 20.0
            inv_x, inv_y = self._involute_profile(t)
            angle = math.atan2(inv_y, inv_x) + math.pi / self.teeth
            radius = math.sqrt(inv_x**2 + inv_y**2) + base_radius
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)
            points.append((x, y))

        tooth = cq.Workplane("XY").spline(points).close()
        return tooth

    def _create_gear(self) -> cq.Workplane:
        """Create complete spur gear."""
        pitch_radius = self.module * self.teeth / 2
        addendum = self.module
        outer_radius = pitch_radius + addendum

        tooth_angle = 360 / self.teeth

        gear_body = (
            cq.Workplane("XY")
            .cylinder(self.thickness, outer_radius + 1)
        )

        for i in range(self.teeth):
            angle = i * tooth_angle
            tooth = self._create_tooth_profile()
            tooth = tooth.rotate((0, 0, 0), (0, 0, 1), angle)
            tooth_solid = tooth.extrude(self.thickness)
            gear_body = gear_body.union(tooth_solid)

        center_hole = cq.Workplane("XY").circle(self.bore / 2).extrude(self.thickness)
        gear = gear_body.cut(center_hole)

        return gear.translate((0, 0, -self.thickness / 2))

    def generate(self, output_dir: str) -> list[str]:
        """Generate gear STL file."""
        output_path = Path(output_dir)

        gear = self._create_gear()
        gear_file = output_path / f"gear_{self.teeth}t_{self.module}m.stl"
        gear.save(str(gear_file))

        return [str(gear_file)]
