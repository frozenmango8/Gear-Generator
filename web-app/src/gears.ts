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
  dFlatProfile,
  asHole,
  rootRadius,
  weld,
  isWatertight,
} from "./common.js";

export type BoreShape = "round" | "d_flat";

export interface GearParams {
  module: number; // mm per tooth on the pitch circle
  teeth: number; // integer >= 6
  pressureAngle?: number; // degrees, default 20 (14.5 legacy allowed)
  boreDiameter?: number; // mm, hole diameter (0 = solid centre)
  boreShape?: BoreShape; // "round" (default) or "d_flat" (D-shaft flat)
  flatDepth?: number; // mm removed by the flat, for boreShape "d_flat"
  hubDiameter?: number; // 0 = none, or > boreDiameter (boss around the bore)
  hubHeight?: number; // mm the hub protrudes above the top face (default: thickness)
  thickness: number; // mm
  backlash?: number; // mm tooth-thickness reduction per gear (default 0)
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

  const backlash = p.backlash ?? 0;
  // tooth thickness at the pitch line is pi*module/2; keep backlash well under it
  if (backlash < 0 || backlash >= (Math.PI * p.module) / 4) {
    throw new GearValidationError(
      `Backlash must be between 0 and ${((Math.PI * p.module) / 4).toFixed(2)} mm for this module.`,
    );
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

  // D-flat: the flat must remove some material but not more than the bore.
  if ((p.boreShape ?? "round") === "d_flat" && bore > 0) {
    const flat = p.flatDepth ?? 0;
    if (!(flat > 0 && flat < bore)) {
      throw new GearValidationError(
        `Flat depth must be between 0 and the bore diameter (${bore.toFixed(2)} mm).`,
      );
    }
  }

  const hub = p.hubDiameter ?? 0;
  if (hub !== 0) {
    if (hub <= bore) {
      throw new GearValidationError("Hub diameter must be 0 (none) or larger than the bore.");
    }
    if (hub >= 2 * (rootRadius(p.teeth, p.module) + DEDENDUM_FACTOR * p.module)) {
      throw new GearValidationError("Hub diameter must be smaller than the pitch diameter.");
    }
    const hubHeight = p.hubHeight ?? p.thickness;
    if (!(hubHeight > 0)) {
      throw new GearValidationError("Hub height must be greater than 0 mm.");
    }
  }
}

/** Extrude an outline (optionally with a hole of any shape) to a solid. */
function extrudeWithHole(
  outline: THREE.Vector2[],
  hole: THREE.Vector2[] | null,
  depth: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline);
  if (hole) shape.holes.push(asHole(hole));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  return weld(geo);
}

/** The bore hole profile for the requested shape (null when there's no bore). */
function boreOutline(p: GearParams): THREE.Vector2[] | null {
  const bore = p.boreDiameter ?? 0;
  if (bore <= 0) return null;
  const r = bore / 2;
  if ((p.boreShape ?? "round") === "d_flat") {
    return dFlatProfile(r, p.flatDepth ?? r * 0.3);
  }
  return circleProfile(r);
}

/**
 * Generate an involute spur gear. Throws GearValidationError on invalid input
 * or a non-watertight result.
 */
export function generateInvoluteGear(params: GearParams): THREE.BufferGeometry {
  validate(params);
  const pa = params.pressureAngle ?? DEFAULT_PRESSURE_ANGLE;
  const hub = params.hubDiameter ?? 0;

  const hole = boreOutline(params);
  const gear = extrudeWithHole(
    involuteGearOutline(params.teeth, params.module, pa, 8, params.backlash ?? 0),
    hole,
    params.thickness,
  );

  let result = gear;
  if (hub > 0) {
    // Boss around the bore, protruding `hubHeight` mm above the top face
    // (independent of gear thickness; defaults to thickness for continuity).
    // Built as its own closed shell and merged with the gear (each watertight,
    // overlapping) — no 3D boolean needed. The bore (incl. any flat) runs
    // through the boss too.
    const hubHeight = params.hubHeight ?? params.thickness;
    const embed = Math.min(params.thickness * 0.25, 0.5); // buried in the gear for a clean overlap
    const boss = extrudeWithHole(circleProfile(hub / 2), hole, hubHeight + embed);
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
    boreShape: (rec.boreShape as BoreShape) ?? "round",
    flatDepth: rec.flatDepth as number | undefined,
    hubDiameter: (rec.hubDiameter as number) ?? 0,
    hubHeight: rec.hubHeight as number | undefined,
    thickness: rec.thickness as number,
    backlash: (rec.backlash as number) ?? 0,
  };
}
