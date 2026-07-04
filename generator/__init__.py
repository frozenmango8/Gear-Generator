"""LEGO Technic-compatible gear generator."""

from .common import GearParams
from .gears import generate_lego_gear, generate_from_dict, GearValidationError

__all__ = [
    "GearParams",
    "generate_lego_gear",
    "generate_from_dict",
    "GearValidationError",
]
