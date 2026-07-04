"""Spur gear generator with involute tooth profile."""

import math
import cadquery as cq
from pathlib import Path
from .base import PartGenerator


class SimpleGear(PartGenerator):
    """Generate a spur gear with a proper involute tooth profile.

    The tooth flanks are true involute curves (20 deg pressure angle),
    so gears of the same module mesh correctly at the standard
    center distance (r1 + r2).
    """

    def __init__(self, teeth: int = 20, module: float = 2.0, bore: float = 8):
        self.teeth = teeth
        self.module = module
        self.bore = bore
        self.thickness = 10
        self.pressure_angle = math.radians(20)

    def _outline(self, steps: int = 6) -> list[tuple[float, float]]:
        """Build the full 2D gear outline as an ordered list of points."""
        m, N = self.module, self.teeth
        pa = self.pressure_angle

        r_pitch = m * N / 2.0
        r_base = r_pitch * math.cos(pa)
        r_outer = r_pitch + m          # addendum
        r_root = max(r_pitch - 1.25 * m, 0.1)   # dedendum

        inv_pa = math.tan(pa) - pa
        half_tooth = math.pi / (2 * N)  # half angular tooth width at pitch circle

        def flank_angle(r: float) -> float:
            """Angular offset of the involute flank from the tooth centerline."""
            rr = max(r, r_base)
            alpha = math.acos(r_base / rr)
            inv_r = math.tan(alpha) - alpha
            return half_tooth + inv_pa - inv_r

        r_start = min(r_root, r_base)
        radii = [r_start + (r_outer - r_start) * i / steps for i in range(steps + 1)]
        tooth_step = 2 * math.pi / N

        pts: list[tuple[float, float]] = []
        for k in range(N):
            c = k * tooth_step  # this tooth's centerline

            # up the right flank (root -> tip)
            for r in radii:
                th = c - flank_angle(r)
                pts.append((r * math.cos(th), r * math.sin(th)))
            # down the left flank (tip -> root)
            for r in reversed(radii):
                th = c + flank_angle(r)
                pts.append((r * math.cos(th), r * math.sin(th)))
            # root arc across to the next tooth
            th_left = c + flank_angle(r_start)
            th_next = (c + tooth_step) - flank_angle(r_start)
            for i in range(1, 4):
                th = th_left + (th_next - th_left) * i / 4
                pts.append((r_root * math.cos(th), r_root * math.sin(th)))

        return pts

    def _create_gear(self) -> cq.Workplane:
        """Create complete spur gear by extruding the toothed profile."""
        pts = self._outline()
        gear = (
            cq.Workplane("XY")
            .polyline(pts)
            .close()
            .extrude(self.thickness)
        )
        gear = gear.faces(">Z").workplane().hole(self.bore)
        return gear.translate((0, 0, -self.thickness / 2))

    def generate(self, output_dir: str) -> list[str]:
        """Generate gear STL file."""
        output_path = Path(output_dir)
        gear = self._create_gear()
        gear_file = output_path / f"gear_{self.teeth}t_{self.module}m.stl"
        cq.exporters.export(gear, str(gear_file))
        return [str(gear_file)]
