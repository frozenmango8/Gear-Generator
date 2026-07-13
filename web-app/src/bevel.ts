/**
 * Straight bevel gears meshing at a 90-degree shaft angle, via Tredgold's
 * approximation — the standard technique for 3D-printable straight bevel
 * gears (used by e.g. most OpenSCAD/CAD bevel-gear generators).
 *
 * Each gear's tooth SHAPE is computed as an equivalent spur-gear tooth at a
 * "virtual" (back-cone) tooth count z/cos(gamma), where gamma is this gear's
 * pitch (cone half-)angle — then scaled down to the gear's real physical
 * pitch radius and replicated at the REAL, integer tooth count. The tapered
 * 3D tooth is a straight loft between that cross-section at the gear's outer
 * (large) end and a uniformly-scaled copy at the inner (small) end,
 * faceWidth further in along the axis — the standard simplification for
 * straight (non-spiral) bevel teeth, whose flanks are straight lines from
 * the cone apex.
 *
 * Scope: 90-degree shaft angle only, straight teeth (no spiral), no profile
 * shift (a meshing pair's shift would need to balance against a changed
 * operating pressure angle — the same reason it's out of scope for the
 * parallel-shaft meshing-pair mode).
 */

import * as THREE from "three";
import {
  MIN_TEETH,
  DEFAULT_PRESSURE_ANGLE,
  singleToothOutline,
  rotatePoints,
  circleProfile,
  dFlatProfile,
  signedArea,
  weld,
  isWatertight,
} from "./common.js";
import { BoreShape } from "./gears.js";

export interface BevelGearParams {
  teeth: number; // this gear's real, integer tooth count
  matingTeeth: number; // the mate's tooth count — sets this gear's pitch angle at 90°
  module: number; // outer transverse module (mm), same convention as the spur module
  pressureAngle?: number; // degrees, default 20
  faceWidth?: number; // axial depth of the tooth region; default outerConeDistance/3
  boreDiameter?: number; // mm, hole through the gear (0 = solid)
  boreShape?: BoreShape; // "round" (default) or "d_flat"
  flatDepth?: number;
  backlash?: number; // mm, same meaning as the spur generator
}

export class BevelGearValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BevelGearValidationError";
  }
}

/** Pitch (cone half-)angle, radians, for two gears meshing at 90°. */
export function bevelPitchAngle(teeth: number, matingTeeth: number): number {
  return Math.atan2(teeth, matingTeeth);
}

/** Outer cone distance (apex to the large end, along the slant) — identical
 *  for both gears in a correctly meshing pair (they share an apex). */
export function bevelOuterConeDistance(teeth: number, matingTeeth: number, module: number): number {
  return (module / 2) * Math.hypot(teeth, matingTeeth);
}

/** Root radius at the gear's outer (large) end, in real physical units. */
function outerRootRadius(
  teeth: number,
  matingTeeth: number,
  module: number,
  pressureAngle: number = DEFAULT_PRESSURE_ANGLE,
  backlash = 0,
): number {
  const gamma = bevelPitchAngle(teeth, matingTeeth);
  const zVirtual = teeth / Math.cos(gamma);
  const { rRoot: rRootVirtual } = singleToothOutline(zVirtual, module, pressureAngle, 8, backlash, 0);
  return rRootVirtual * Math.cos(gamma);
}

/** Max bore diameter before it reaches the tooth root at the (narrower)
 *  small/toe end — used both internally and by the GUI for slider bounds. */
export function bevelMaxBoreDiameter(
  teeth: number,
  matingTeeth: number,
  module: number,
  pressureAngle: number = DEFAULT_PRESSURE_ANGLE,
  faceWidth?: number,
  backlash = 0,
): number {
  const Ro = bevelOuterConeDistance(teeth, matingTeeth, module);
  const fw = faceWidth ?? Ro / 3;
  const rRootReal = outerRootRadius(teeth, matingTeeth, module, pressureAngle, backlash);
  return 2 * rRootReal * ((Ro - fw) / Ro);
}

interface Validated {
  gamma: number;
  Ro: number;
  faceWidth: number;
  pa: number;
  backlash: number;
}

function validate(p: BevelGearParams): Validated {
  if (!(p.module > 0)) throw new BevelGearValidationError("Module must be greater than 0.");
  if (!Number.isInteger(p.teeth) || p.teeth < MIN_TEETH) {
    throw new BevelGearValidationError(`Teeth must be a whole number ≥ ${MIN_TEETH}.`);
  }
  if (!Number.isInteger(p.matingTeeth) || p.matingTeeth < MIN_TEETH) {
    throw new BevelGearValidationError(`Mating teeth must be a whole number ≥ ${MIN_TEETH}.`);
  }
  const pa = p.pressureAngle ?? DEFAULT_PRESSURE_ANGLE;
  if (!(pa > 0 && pa < 45)) {
    throw new BevelGearValidationError("Pressure angle must be between 0 and 45 degrees.");
  }
  const backlash = p.backlash ?? 0;
  if (backlash < 0 || backlash >= (Math.PI * p.module) / 4) {
    throw new BevelGearValidationError(
      `Backlash must be between 0 and ${((Math.PI * p.module) / 4).toFixed(2)} mm for this module.`,
    );
  }

  const gamma = bevelPitchAngle(p.teeth, p.matingTeeth);
  const Ro = bevelOuterConeDistance(p.teeth, p.matingTeeth, p.module);
  const faceWidth = p.faceWidth ?? Ro / 3;
  if (!(faceWidth > 0) || faceWidth >= Ro) {
    throw new BevelGearValidationError(
      `Face width must be between 0 and the outer cone distance (${Ro.toFixed(2)} mm).`,
    );
  }

  const bore = p.boreDiameter ?? 0;
  if (bore < 0) throw new BevelGearValidationError("Bore diameter cannot be negative.");
  if ((p.boreShape ?? "round") === "d_flat" && bore > 0) {
    const flat = p.flatDepth ?? 0;
    if (!(flat > 0 && flat < bore)) {
      throw new BevelGearValidationError(
        `Flat depth must be between 0 and the bore diameter (${bore.toFixed(2)} mm).`,
      );
    }
  }
  return { gamma, Ro, faceWidth, pa, backlash };
}

/** The gear's 2D cross-section at the outer (large) end: real tooth count,
 *  real physical pitch radius, plus the (unscaled) root radius for bore
 *  validation against the narrower inner end. */
function outerCrossSection(p: BevelGearParams, v: Validated) {
  const zVirtual = p.teeth / Math.cos(v.gamma);
  const { points: virtualTooth, toothStep: virtualStep } = singleToothOutline(zVirtual, p.module, v.pa, 8, v.backlash, 0);
  const k = Math.cos(v.gamma); // virtual (back-cone) radius -> real physical radius
  const realStep = (2 * Math.PI) / p.teeth; // REAL teeth spacing (not the virtual one)
  // Back-cone development (Tredgold's approximation): the virtual tooth cell
  // spans virtualStep radians (== k * realStep, since zVirtual = teeth/k), a
  // narrower angular footprint than the real teeth's spacing. A cone unrolls
  // with the same apex-angle scale factor at every radius, so mapping the
  // whole flank onto the real gear needs BOTH a radius scale (k) and the
  // inverse angle scale (1/k) — not just a uniform (x,y)*k scale, which would
  // leave the cell's own angular width unchanged at virtualStep while it gets
  // replicated at the wider realStep, tearing gaps into the outline between
  // teeth (visually: thin radiating spikes instead of proper tooth flanks).
  const angleScale = realStep / virtualStep; // == 1 / k
  const realTooth = virtualTooth.map((pt) => {
    const r = Math.hypot(pt.x, pt.y);
    const theta = Math.atan2(pt.y, pt.x) * angleScale;
    return new THREE.Vector2(Math.cos(theta) * r * k, Math.sin(theta) * r * k);
  });

  const outline: THREE.Vector2[] = [];
  for (let i = 0; i < p.teeth; i++) outline.push(...rotatePoints(realTooth, i * realStep));

  const bore = p.boreDiameter ?? 0;
  let hole: THREE.Vector2[] | null = null;
  if (bore > 0) {
    const r = bore / 2;
    hole = (p.boreShape ?? "round") === "d_flat" ? dFlatProfile(r, p.flatDepth ?? r * 0.3) : circleProfile(r);
  }
  return { outline, hole };
}

/** Triangulate a polygon-with-hole via earcut, offset the hole's indices to
 *  follow the outer contour in a combined point array (outer + hole). */
function triangulateWithHole(
  outer: THREE.Vector2[],
  hole: THREE.Vector2[] | null,
): { points: THREE.Vector2[]; triangles: number[][] } {
  const holes = hole ? [hole] : [];
  const triangles = THREE.ShapeUtils.triangulateShape(outer, holes);
  const points = hole ? [...outer, ...hole] : outer;
  return { points, triangles };
}

/**
 * Generate a straight bevel gear. Throws BevelGearValidationError on invalid
 * input or a non-watertight result. Axis is Z; the tooth region spans
 * [-faceWidth/2, +faceWidth/2] with the large (outer) end at +Z.
 */
export function generateBevelGear(params: BevelGearParams): THREE.BufferGeometry {
  const v = validate(params);
  const { outline: outerOutline, hole: outerHole } = outerCrossSection(params, v);

  const maxBoreDiameter = bevelMaxBoreDiameter(
    params.teeth, params.matingTeeth, params.module, v.pa, v.faceWidth, v.backlash,
  );
  const bore = params.boreDiameter ?? 0;
  if (bore >= maxBoreDiameter) {
    throw new BevelGearValidationError(
      `Bore diameter (${bore.toFixed(2)} mm) reaches the tooth root at the small end ` +
        `(max ${maxBoreDiameter.toFixed(2)} mm). Reduce the bore or the face width.`,
    );
  }

  const s = (v.Ro - v.faceWidth) / v.Ro; // Tredgold's linear taper toward the apex
  const innerOutline = outerOutline.map((p) => new THREE.Vector2(p.x * s, p.y * s));
  const innerHole = outerHole ? outerHole.map((p) => new THREE.Vector2(p.x * s, p.y * s)) : null;

  const halfFace = v.faceWidth / 2;

  // Outer contour should be CCW (existing convention throughout common.ts);
  // flip if not, so cap-winding assumptions below hold regardless of caller input.
  const ccw = signedArea(outerOutline) > 0;
  const oOut = ccw ? outerOutline : outerOutline.slice().reverse();
  const iOut = ccw ? innerOutline : innerOutline.slice().reverse();
  const oHole = outerHole ? (signedArea(outerHole) < 0 ? outerHole : outerHole.slice().reverse()) : null;
  const iHole = innerHole ? (signedArea(innerHole) < 0 ? innerHole : innerHole.slice().reverse()) : null;

  const positions: number[] = [];
  const indices: number[] = [];
  const pushPt = (p: THREE.Vector2, z: number) => {
    positions.push(p.x, p.y, z);
    return positions.length / 3 - 1;
  };

  // --- side walls: outer tooth boundary + (if present) bore boundary ---
  // Same triangle order for both: oHole/iHole are already stored CW (opposite
  // of oOut/iOut's CCW) by the reversal above, so this one formula naturally
  // produces outward-facing normals for the outer wall and inward-facing
  // (correct for a hole) normals for the bore wall — verified against a
  // directed-edge consistency check (every edge shared by exactly two
  // triangles wound in opposite directions), not just aggregate signed volume,
  // since a net-positive volume can still hide locally-backwards triangles.
  function sideWall(outerRing: THREE.Vector2[], innerRing: THREE.Vector2[]) {
    const n = outerRing.length;
    const oIdx = outerRing.map((p) => pushPt(p, halfFace));
    const iIdx = innerRing.map((p) => pushPt(p, -halfFace));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = oIdx[i], b = oIdx[j], c = iIdx[j], d = iIdx[i];
      indices.push(a, c, b, a, d, c);
    }
  }
  sideWall(oOut, iOut);
  if (oHole && iHole) sideWall(oHole, iHole);

  // --- end caps (outer at +halfFace facing +Z, inner at -halfFace facing -Z) ---
  function cap(outerRing: THREE.Vector2[], holeRing: THREE.Vector2[] | null, z: number, flip: boolean) {
    const { points, triangles } = triangulateWithHole(outerRing, holeRing);
    const idx = points.map((p) => pushPt(p, z));
    for (const [a, b, c] of triangles) {
      if (flip) indices.push(idx[a], idx[c], idx[b]);
      else indices.push(idx[a], idx[b], idx[c]);
    }
  }
  cap(oOut, oHole, halfFace, false); // outer cap faces +Z
  cap(iOut, iHole, -halfFace, true); // inner cap faces -Z (reversed winding)

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  const welded = weld(geo);
  if (!isWatertight(welded)) {
    throw new BevelGearValidationError(
      "Internal error: generated bevel gear mesh is not watertight; adjust parameters or report this.",
    );
  }
  return welded;
}
