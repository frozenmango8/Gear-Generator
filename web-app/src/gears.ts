/**
 * General-purpose involute spur gear generator.
 *
 * generateInvoluteGear(params) is pure: parameters in, THREE.BufferGeometry
 * out. The tooth profile and the round bore are both 2D operations (Shape +
 * hole) extruded to the requested thickness — no 3D boolean, no WASM.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  MIN_TEETH,
  DEFAULT_PRESSURE_ANGLE,
  DEDENDUM_FACTOR,
  involuteGearOutline,
  circleProfile,
  asHole,
  rootRadius,
  weld,
  isWatertight,
} from "./common.js";

export interface GearParams {
  module: number; // mm per tooth on the pitch circle
  teeth: number; // integer >= 6
  pressureAngle?: number; // degrees, default 20 (14.5 legacy allowed)
  boreDiameter?: number; // mm, plain round hole (0 = solid centre)
  hubDiameter?: number; // 0 = none, or > boreDiameter (boss around the bore)
  thickness: number; // mm
}

/** Typed validation error. */
export class GearValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GearValidationError";
  }
}

/** Check parameters. Throws GearValidationError. */
export function validate(p: GearParams): void {
  if (!(p.module > 0)) {
    throw new GearValidationError("Module must be greater than 0.");
  }
  if (!Number.isInteger(p.teeth) || p.teeth < MIN_TEETH) {
    throw new GearValidationError(
      `Teeth must be a whole number ≥ ${MIN_TEETH} (fewer undercut and will not mesh cleanly).`,
    );
  }
  const pa = p.pressureAngle ?? DEFAULT_PRESSURE_ANGLE;
  if (!(pa > 0 && pa < 45)) {
    throw new GearValidationError("Pressure angle must be between 0 and 45 degrees.");
  }
  if (!(p.thickness > 0)) {
    throw new GearValidationError("Thickness must be greater than 0 mm.");
  }

  const bore = p.boreDiameter ?? 0;
  if (bore < 0) throw new GearValidationError("Bore diameter cannot be negative.");
  // Bore must not cut into the tooth root: boreDiameter < pitchDiameter - 2*dedendum.
  const maxBore = 2 * rootRadius(p.teeth, p.module);
  if (bore >= maxBore) {
    throw new GearValidationError(
      `Bore diameter (${bore.toFixed(2)} mm) reaches the tooth root ` +
        `(max ${maxBore.toFixed(2)} mm). Reduce the bore or add teeth/module.`,
    );
  }

  const hub = p.hubDiameter ?? 0;
  if (hub !== 0) {
    if (hub <= bore) {
      throw new GearValidationError("Hub diameter must be 0 (none) or larger than the bore.");
    }
    if (hub >= 2 * (rootRadius(p.teeth, p.module) + DEDENDUM_FACTOR * p.module)) {
      throw new GearValidationError("Hub diameter must be smaller than the pitch diameter.");
    }
  }
}

/** Extrude a toothed/round profile (optionally with a round hole) to a solid. */
function extrudeProfile(
  outline: THREE.Vector2[],
  holeRadius: number,
  depth: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline);
  if (holeRadius > 0) shape.holes.push(asHole(circleProfile(holeRadius)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  return weld(geo);
}

/**
 * Generate an involute spur gear. Throws GearValidationError on invalid input
 * or a non-watertight result.
 */
export function generateInvoluteGear(params: GearParams): THREE.BufferGeometry {
  validate(params);
  const pa = params.pressureAngle ?? DEFAULT_PRESSURE_ANGLE;
  const bore = params.boreDiameter ?? 0;
  const hub = params.hubDiameter ?? 0;
  const boreR = bore / 2;

  const gear = extrudeProfile(
    involuteGearOutline(params.teeth, params.module, pa),
    boreR,
    params.thickness,
  );

  let result = gear;
  if (hub > 0) {
    // Boss around the bore, as tall as the gear, protruding above the top face.
    // Built as its own closed shell and merged with the gear (each watertight,
    // overlapping) — no 3D boolean needed.
    const embed = Math.min(params.thickness * 0.25, 0.5);
    const boss = extrudeProfile(circleProfile(hub / 2), boreR, params.thickness);
    boss.translate(0, 0, params.thickness - embed);
    result = mergeGeometries([gear, boss], false);
  }

  if (!isWatertight(result)) {
    throw new GearValidationError(
      "Internal error: generated mesh is not watertight; adjust parameters or report this.",
    );
  }
  return result;
}

/** Build params from a preset record (JSON data, decoupled from code). */
export function gearParamsFromPreset(rec: Record<string, unknown>): GearParams {
  return {
    module: rec.module as number,
    teeth: rec.teeth as number,
    pressureAngle: (rec.pressureAngle as number) ?? DEFAULT_PRESSURE_ANGLE,
    boreDiameter: (rec.boreDiameter as number) ?? 0,
    hubDiameter: (rec.hubDiameter as number) ?? 0,
    thickness: rec.thickness as number,
  };
}
