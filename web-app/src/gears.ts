/**
 * LEGO Technic-compatible gear generation (ported 1:1 from generator/gears.py).
 *
 * generateLegoGear(params) is pure: parameters in, THREE.BufferGeometry out.
 * The bore is subtracted in 2D (Shape hole) exactly as the Python builds a
 * shapely polygon-with-hole before extruding — watertight by construction.
 */

import * as THREE from "three";
import {
  BoreType,
  PLATE_MM,
  SUPPORTED_TEETH,
  MIN_CUSTOM_TEETH,
  boreProfile,
  boreMaxRadius,
  involuteGearOutline,
  rootRadius,
  weld,
  isWatertight,
} from "./common.js";

export interface GearParams {
  teeth: number;
  thicknessUnits?: number; // multiples of PLATE_MM (default 1)
  boreType?: BoreType; // default "cross_axle"
  hubStyle?: string; // reserved; "flat" for v1
  allowCustom?: boolean; // permit teeth outside SUPPORTED_TEETH
}

/** Typed error matching the Python GearValidationError. */
export class GearValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GearValidationError";
  }
}

function thicknessMm(p: GearParams): number {
  return (p.thicknessUnits ?? 1.0) * PLATE_MM;
}

/** Check parameters against the LEGO system. Throws GearValidationError. */
export function validate(params: GearParams): void {
  const t = params.teeth;
  if (!Number.isInteger(t) || t <= 0) {
    throw new GearValidationError("Teeth must be a positive whole number.");
  }

  const boreType = params.boreType ?? "cross_axle";
  const allowCustom = params.allowCustom ?? false;

  if (!allowCustom && !(SUPPORTED_TEETH as readonly number[]).includes(t)) {
    const allowed = SUPPORTED_TEETH.join(", ");
    throw new GearValidationError(
      `${t} teeth is not a standard LEGO count. Choose one of: ${allowed}.`,
    );
  }
  if (allowCustom && t < MIN_CUSTOM_TEETH) {
    throw new GearValidationError(
      `Custom gears need at least ${MIN_CUSTOM_TEETH} teeth ` +
        "(fewer undercut and will not mesh cleanly).",
    );
  }

  if ((params.thicknessUnits ?? 1.0) <= 0) {
    throw new GearValidationError(
      "Thickness must be a positive number of plate units.",
    );
  }

  if (boreType !== "cross_axle" && boreType !== "pin_hole") {
    throw new GearValidationError(
      `Unknown bore type ${boreType}; use cross_axle or pin_hole.`,
    );
  }

  // Bore must not eat into the tooth root circle.
  const rRoot = rootRadius(t);
  const rBore = boreMaxRadius(boreType);
  if (rBore >= rRoot) {
    throw new GearValidationError(
      `Bore (r=${rBore.toFixed(2)} mm) conflicts with tooth root ` +
        `(r=${rRoot.toFixed(2)} mm). Too few teeth for this bore.`,
    );
  }
}

/** Clockwise copy of a point loop, for use as an extrude hole. */
function asHole(points: THREE.Vector2[]): THREE.Path {
  // boreProfile returns CCW loops; ExtrudeGeometry wants holes wound opposite
  // to the (CCW) outer contour, i.e. clockwise.
  const cw = signedArea(points) > 0 ? points.slice().reverse() : points;
  return new THREE.Path(cw);
}

function signedArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

/**
 * Generate a LEGO Technic-compatible gear.
 * Throws GearValidationError on invalid parameters or a non-watertight result.
 */
export function generateLegoGear(params: GearParams): THREE.BufferGeometry {
  validate(params);
  const teeth = params.teeth;
  const boreType = params.boreType ?? "cross_axle";

  const shape = new THREE.Shape(involuteGearOutline(teeth));
  shape.holes.push(asHole(boreProfile(boreType)));

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessMm(params),
    bevelEnabled: false,
    steps: 1,
  });
  geo.computeVertexNormals();

  const welded = weld(geo);
  if (!isWatertight(welded)) {
    throw new GearValidationError(
      "Internal error: generated mesh is not watertight; " +
        "adjust parameters or report this.",
    );
  }
  return welded;
}

/** Build from a preset record (snake_case JSON) — presets stay unchanged data. */
export function gearParamsFromPreset(rec: Record<string, unknown>): GearParams {
  return {
    teeth: rec.teeth as number,
    thicknessUnits: (rec.thickness_units as number) ?? 1.0,
    boreType: (rec.bore_type as BoreType) ?? "cross_axle",
    hubStyle: (rec.hub_style as string) ?? "flat",
  };
}
