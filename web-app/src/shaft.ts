/**
 * Matching shaft ("pole") that fits a gear's bore. It mirrors the bore shape
 * (round or D-flat) shrunk by a printing clearance so it actually slides in,
 * and — for a D-flat bore — keeps the flat so it keys against rotation.
 */

import * as THREE from "three";
import { circleProfile, dFlatProfile, weld, isWatertight } from "./common.js";
import { BoreShape } from "./gears.js";

export interface ShaftParams {
  boreDiameter: number; // the gear bore this shaft goes into (mm)
  boreShape?: BoreShape; // "round" (default) or "d_flat"
  flatDepth?: number; // the gear's flat depth, for d_flat
  length: number; // shaft length (mm)
  clearance?: number; // radial gap so it slides in when printed (mm, default 0.2)
}

export class ShaftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShaftError";
  }
}

/** Generate a shaft geometry that fits the given bore. */
export function generateShaft(p: ShaftParams): THREE.BufferGeometry {
  if (!(p.boreDiameter > 0)) throw new ShaftError("Set a bore first — there's no hole to fit.");
  if (!(p.length > 0)) throw new ShaftError("Shaft length must be greater than 0 mm.");

  const clr = p.clearance ?? 0.2;
  const r = p.boreDiameter / 2 - clr; // shaft radius = bore radius minus clearance
  if (r < 0.3) throw new ShaftError("Bore is too small for a shaft at this clearance.");

  let outline: THREE.Vector2[];
  if ((p.boreShape ?? "round") === "d_flat") {
    // Same flat depth but on the smaller radius -> the flat sits `clr` inside
    // the bore's flat, giving clearance on the flat as well as the round part.
    const flat = Math.min(p.flatDepth ?? 0, 2 * r - 0.3);
    outline = flat > 0 ? dFlatProfile(r, flat) : circleProfile(r);
  } else {
    outline = circleProfile(r);
  }

  const shape = new THREE.Shape(outline);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: p.length, bevelEnabled: false, steps: 1 });
  const welded = weld(geo);
  if (!isWatertight(welded)) {
    throw new ShaftError("Internal error: shaft mesh is not watertight.");
  }
  return welded;
}
