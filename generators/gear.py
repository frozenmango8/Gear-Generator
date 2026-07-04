"""Spur gear generator with LEGO-style or involute tooth profiles."""

import math
import cadquery as cq
from pathlib import Path
from .base import PartGenerator


class SimpleGear(PartGenerator):
    """Generate a spur gear.

    Two tooth styles are available:

    * ``lego``     - chunky, flat-topped trapezoidal teeth (the classic
                     LEGO Technic look). Meshes with any same-module gear.
    * ``involute`` - true involute flanks (20 deg pressure angle) for the
                     smoothest rolling contact.

    Either way, two gears mesh when they share the same ``module`` and are
    placed at center distance r1 + r2.
    """

    def __init__(
        self,
        teeth: int = 20,
        module: float = 2.0,
        bore: float = 8,
        style: str = "lego",
    ):
        self.teeth = teeth
        self.module = module
        self.bore = bore
        self.style = style
        self.thickness = 10
        self.pressure_angle = math.radians(20)

    # ------------------------------------------------------------------ #
    # LEGO-style chunky teeth                                            #
    # ------------------------------------------------------------------ #
    def _lego_outline(self) -> list[tuple[float, float]]:
        """Flat-topped trapezoidal teeth in the LEGO Technic style."""
        m, N = self.module, self.teeth
        r_pitch = m * N / 2.0
        r_outer = r_pitch + 0.8 * m     # flat tooth top
        r_root = max(r_pitch - 0.9 * m, 0.1)

        tooth_step = 2 * math.pi / N
        half_base = tooth_step * 0.30   # wide at the base
        half_top = tooth_step * 0.17    # narrower flat top -> trapezoid

        pts: list[tuple[float, float]] = []
        for k in range(N):
            c = k * tooth_step
            # up the right side, across the flat top, down the left side
            pts.append((r_root * math.cos(c - half_base), r_root * math.sin(c - half_base)))
            pts.append((r_outer * math.cos(c - half_top), r_outer * math.sin(c - half_top)))
            pts.append((r_outer * math.cos(c + half_top), r_outer * math.sin(c + half_top)))
            pts.append((r_root * math.cos(c + half_base), r_root * math.sin(c + half_base)))
            # flat-bottomed gap arc to the next tooth
            a0, a1 = c + half_base, c + tooth_step - half_base
            for i in range(1, 3):
                a = a0 + (a1 - a0) * i / 3
                pts.append((r_root * math.cos(a), r_root * math.sin(a)))
        return pts

    # ------------------------------------------------------------------ #
    # Involute teeth                                                     #
    # ------------------------------------------------------------------ #
    def _involute_outline(self, steps: int = 6) -> list[tuple[float, float]]:
        """True involute tooth profile (20 deg pressure angle)."""
        m, N = self.module, self.teeth
        pa = self.pressure_angle

        r_pitch = m * N / 2.0
        r_base = r_pitch * math.cos(pa)
        r_outer = r_pitch + m
        r_root = max(r_pitch - 1.25 * m, 0.1)

        inv_pa = math.tan(pa) - pa
        half_tooth = math.pi / (2 * N)

        def flank_angle(r: float) -> float:
            rr = max(r, r_base)
            alpha = math.acos(r_base / rr)
            inv_r = math.tan(alpha) - alpha
            return half_tooth + inv_pa - inv_r

        r_start = min(r_root, r_base)
        radii = [r_start + (r_outer - r_start) * i / steps for i in range(steps + 1)]
        tooth_step = 2 * math.pi / N

        pts: list[tuple[float, float]] = []
        for k in range(N):
            c = k * tooth_step
            for r in radii:
                th = c - flank_angle(r)
                pts.append((r * math.cos(th), r * math.sin(th)))
            for r in reversed(radii):
                th = c + flank_angle(r)
                pts.append((r * math.cos(th), r * math.sin(th)))
            th_left = c + flank_angle(r_start)
            th_next = (c + tooth_step) - flank_angle(r_start)
            for i in range(1, 4):
                th = th_left + (th_next - th_left) * i / 4
                pts.append((r_root * math.cos(th), r_root * math.sin(th)))
        return pts

    def outline(self) -> list[tuple[float, float]]:
        """Return the 2D gear outline for the selected style."""
        if self.style == "involute":
            return self._involute_outline()
        return self._lego_outline()

    def _create_gear(self) -> cq.Workplane:
        """Create the complete gear by extruding the toothed profile."""
        gear = (
            cq.Workplane("XY")
            .polyline(self.outline())
            .close()
            .extrude(self.thickness)
        )
        gear = gear.faces(">Z").workplane().hole(self.bore)
        return gear.translate((0, 0, -self.thickness / 2))

    def generate(self, output_dir: str) -> list[str]:
        """Generate the gear STL file."""
        output_path = Path(output_dir)
        gear = self._create_gear()
        gear_file = output_path / f"gear_{self.teeth}t_{self.module}m_{self.style}.stl"
        cq.exporters.export(gear, str(gear_file))
        return [str(gear_file)]
