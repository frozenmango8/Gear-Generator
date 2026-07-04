"""Shared geometry helpers and verified LEGO dimensional constants.

All geometry logic lives here or in gears.py; the GUI never computes geometry.

Sources for the constants below:
  * 1 LDU = 0.4 mm; 1 stud = 20 LDU = 8 mm; 1 plate = 8 LDU = 3.2 mm.
  * LEGO spur gears use metric MODULE 1: pitch diameter (mm) == tooth count,
    circular pitch == pi mm. (Confirmed: BrickNerd, technicbrickpower,
    cailliau LEGO gear references.)
  * Pin hole / axle envelope ~= 4.8 mm.

CONFIDENCE NOTE: the cross-axle RIB WIDTH could not be pulled from the raw
LDraw primitive (network-blocked at build time). AXLE_ARM_WIDTH below uses the
community 3D-printing consensus (~2.0 mm in a 4.8 mm span). Treat the axle
constants as tune-to-fit: print the fit gauge, adjust here, reprint. Every
value a real LEGO part must match is a named constant so there is exactly one
place to change.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import trimesh
from shapely.geometry import Point, box
from shapely.ops import unary_union

# --------------------------------------------------------------------------- #
# Verified base units                                                         #
# --------------------------------------------------------------------------- #
LDU_MM = 0.4                # 1 LDraw Unit in millimetres
STUD_MM = 8.0               # stud pitch (unit spacing)
PLATE_MM = 3.2              # one plate-height unit (1/3 brick)

# --------------------------------------------------------------------------- #
# Gear system (module 1 is the whole reason these mesh with real LEGO)        #
# --------------------------------------------------------------------------- #
MODULE_MM = 1.0             # LOCKED. Do not expose as a free parameter.
PRESSURE_ANGLE_DEG = 20.0
ADDENDUM = 1.0 * MODULE_MM
DEDENDUM = 1.25 * MODULE_MM

# --------------------------------------------------------------------------- #
# Bore dimensions (tune-to-fit; see confidence note above)                    #
# --------------------------------------------------------------------------- #
PIN_HOLE_DIA = 4.8          # round Technic pin hole
AXLE_TIP_TO_TIP = 4.8       # cross axle span, arm tip to opposite arm tip
AXLE_ARM_WIDTH = 2.0        # width of each rib of the plus (community value)
BORE_CLEARANCE = 0.10       # added all round so a real part slides in / prints

SUPPORTED_TEETH = (8, 16, 20, 24, 40)
MIN_CUSTOM_TEETH = 6        # below this, module-1 involute teeth undercut badly


@dataclass
class GearParams:
    """Pure, UI-agnostic description of a gear to generate."""

    teeth: int
    thickness_units: float = 1.0          # multiples of PLATE_MM
    bore_type: str = "cross_axle"         # "cross_axle" | "pin_hole"
    hub_style: str = "flat"               # reserved; "flat" for v1
    allow_custom: bool = False            # permit teeth outside SUPPORTED_TEETH

    @property
    def thickness_mm(self) -> float:
        return self.thickness_units * PLATE_MM


# --------------------------------------------------------------------------- #
# 2D profiles (shapely) — extruded later                                      #
# --------------------------------------------------------------------------- #
def pitch_radius(teeth: int, module: float = MODULE_MM) -> float:
    return module * teeth / 2.0


def root_radius(teeth: int, module: float = MODULE_MM) -> float:
    return max(pitch_radius(teeth, module) - DEDENDUM, 0.1)


def outer_radius(teeth: int, module: float = MODULE_MM) -> float:
    return pitch_radius(teeth, module) + ADDENDUM


def involute_gear_outline(teeth: int, module: float = MODULE_MM, steps: int = 8):
    """Return ordered (x, y) points of the full involute gear outline."""
    pa = math.radians(PRESSURE_ANGLE_DEG)
    r_pitch = pitch_radius(teeth, module)
    r_base = r_pitch * math.cos(pa)
    r_out = outer_radius(teeth, module)
    r_root = root_radius(teeth, module)

    inv_pa = math.tan(pa) - pa
    half_tooth = math.pi / (2 * teeth)

    def flank(r: float) -> float:
        rr = max(r, r_base)
        alpha = math.acos(r_base / rr)
        return half_tooth + inv_pa - (math.tan(alpha) - alpha)

    r_start = min(r_root, r_base)
    radii = [r_start + (r_out - r_start) * i / steps for i in range(steps + 1)]
    tooth_step = 2 * math.pi / teeth

    pts: list[tuple[float, float]] = []
    for k in range(teeth):
        c = k * tooth_step
        for r in radii:
            th = c - flank(r)
            pts.append((r * math.cos(th), r * math.sin(th)))
        for r in reversed(radii):
            th = c + flank(r)
            pts.append((r * math.cos(th), r * math.sin(th)))
        th_left = c + flank(r_start)
        th_next = (c + tooth_step) - flank(r_start)
        for i in range(1, 4):
            th = th_left + (th_next - th_left) * i / 4
            pts.append((r_root * math.cos(th), r_root * math.sin(th)))
    return pts


def cross_axle_profile(clearance: float = BORE_CLEARANCE):
    """Plus/cross-shaped bore matching a LEGO Technic axle (with clearance)."""
    half_span = (AXLE_TIP_TO_TIP + clearance) / 2.0
    half_arm = (AXLE_ARM_WIDTH + clearance) / 2.0
    bar_h = box(-half_span, -half_arm, half_span, half_arm)
    bar_v = box(-half_arm, -half_span, half_arm, half_span)
    return unary_union([bar_h, bar_v])


def pin_hole_profile(clearance: float = BORE_CLEARANCE):
    """Round Technic pin hole (with clearance)."""
    return Point(0, 0).buffer((PIN_HOLE_DIA + clearance) / 2.0, resolution=64)


def bore_profile(bore_type: str, clearance: float = BORE_CLEARANCE):
    if bore_type == "cross_axle":
        return cross_axle_profile(clearance)
    if bore_type == "pin_hole":
        return pin_hole_profile(clearance)
    raise ValueError(f"unknown bore_type: {bore_type!r}")


def bore_max_radius(bore_type: str, clearance: float = BORE_CLEARANCE) -> float:
    """Largest radial extent of the bore, for clash checks against tooth root."""
    if bore_type == "cross_axle":
        return (AXLE_TIP_TO_TIP + clearance) / 2.0
    if bore_type == "pin_hole":
        return (PIN_HOLE_DIA + clearance) / 2.0
    raise ValueError(f"unknown bore_type: {bore_type!r}")


def export_stl(mesh: trimesh.Trimesh, path: str) -> str:
    """Write a binary STL and return the path."""
    mesh.export(path, file_type="stl")
    return path
