"""LEGO Technic-compatible gear generation.

`generate_lego_gear` is pure and UI-agnostic: parameters in, Trimesh out.
"""

from __future__ import annotations

import trimesh
from shapely.geometry import Polygon

from . import common
from .common import GearParams


class GearValidationError(ValueError):
    """Raised when parameters cannot produce a valid, LEGO-compatible gear."""


def validate(params: GearParams) -> None:
    """Check parameters against the LEGO system. Raises GearValidationError."""
    t = params.teeth
    if not isinstance(t, int) or t <= 0:
        raise GearValidationError("Teeth must be a positive whole number.")

    if not params.allow_custom and t not in common.SUPPORTED_TEETH:
        allowed = ", ".join(str(x) for x in common.SUPPORTED_TEETH)
        raise GearValidationError(
            f"{t} teeth is not a standard LEGO count. Choose one of: {allowed}."
        )
    if params.allow_custom and t < common.MIN_CUSTOM_TEETH:
        raise GearValidationError(
            f"Custom gears need at least {common.MIN_CUSTOM_TEETH} teeth "
            "(fewer undercut and will not mesh cleanly)."
        )

    if params.thickness_units <= 0:
        raise GearValidationError("Thickness must be a positive number of plate units.")

    if params.bore_type not in ("cross_axle", "pin_hole"):
        raise GearValidationError(
            f"Unknown bore type {params.bore_type!r}; use cross_axle or pin_hole."
        )

    # Bore must not eat into the tooth root circle.
    r_root = common.root_radius(t)
    r_bore = common.bore_max_radius(params.bore_type)
    if r_bore >= r_root:
        raise GearValidationError(
            f"Bore (r={r_bore:.2f} mm) conflicts with tooth root "
            f"(r={r_root:.2f} mm). Too few teeth for this bore."
        )


def _profile_with_bore(params: GearParams) -> Polygon:
    """2D gear cross-section (toothed outline minus the bore)."""
    outline = Polygon(common.involute_gear_outline(params.teeth))
    if not outline.is_valid:
        outline = outline.buffer(0)  # heal any self-touching from the tooth loop
    bore = common.bore_profile(params.bore_type)
    return outline.difference(bore)


def generate_lego_gear(params: GearParams) -> trimesh.Trimesh:
    """Generate a LEGO Technic-compatible gear mesh.

    Raises GearValidationError on invalid parameters.
    """
    validate(params)
    section = _profile_with_bore(params)
    mesh = trimesh.creation.extrude_polygon(section, height=params.thickness_mm)
    mesh.merge_vertices()
    if not mesh.is_watertight:
        raise GearValidationError(
            "Internal error: generated mesh is not watertight; "
            "adjust parameters or report this."
        )
    return mesh


def generate_from_dict(d: dict) -> trimesh.Trimesh:
    """Convenience: build from a plain dict (e.g. a loaded preset)."""
    return generate_lego_gear(GearParams(**d))
