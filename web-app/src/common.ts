/**
 * Shared geometry helpers and verified LEGO dimensional constants.
 *
 * Ported 1:1 from generator/common.py. All constants, formulas and the
 * involute outline are preserved exactly — this is a port, not a redesign.
 *
 * Sources (see common.py):
 *   - 1 LDU = 0.4 mm; 1 stud = 20 LDU = 8 mm; 1 plate = 8 LDU = 3.2 mm.
 *   - LEGO spur gears use metric MODULE 1: pitch diameter (mm) == tooth count.
 *   - Pin hole / axle envelope ~= 4.8 mm.
 *
 * CONFIDENCE NOTE (carried over): the cross-axle RIB WIDTH uses the community
 * value (~2.0 mm in a 4.8 mm span). Tune-to-fit via the fit gauge.
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// --------------------------------------------------------------------------- //
// Verified base units                                                         //
// --------------------------------------------------------------------------- //
export const LDU_MM = 0.4; // 1 LDraw Unit in millimetres
export const STUD_MM = 8.0; // stud pitch (unit spacing)
export const PLATE_MM = 3.2; // one plate-height unit (1/3 brick)

// --------------------------------------------------------------------------- //
// Gear system (module 1 is the whole reason these mesh with real LEGO)        //
// --------------------------------------------------------------------------- //
export const MODULE_MM = 1.0; // LOCKED. Not a free parameter.
export const PRESSURE_ANGLE_DEG = 20.0;
export const ADDENDUM = 1.0 * MODULE_MM;
export const DEDENDUM = 1.25 * MODULE_MM;

// --------------------------------------------------------------------------- //
// Bore dimensions (tune-to-fit; see confidence note above)                    //
// --------------------------------------------------------------------------- //
export const PIN_HOLE_DIA = 4.8; // round Technic pin hole
export const AXLE_TIP_TO_TIP = 4.8; // cross axle span, arm tip to opposite tip
export const AXLE_ARM_WIDTH = 2.0; // width of each rib of the plus
export const BORE_CLEARANCE = 0.1; // added all round so a real part slides in

export const SUPPORTED_TEETH = [8, 16, 20, 24, 40] as const;
export const MIN_CUSTOM_TEETH = 6; // below this, module-1 teeth undercut badly

export type BoreType = "cross_axle" | "pin_hole";

// --------------------------------------------------------------------------- //
// Radii                                                                       //
// --------------------------------------------------------------------------- //
export function pitchRadius(teeth: number, module = MODULE_MM): number {
  return (module * teeth) / 2.0;
}

export function rootRadius(teeth: number, module = MODULE_MM): number {
  return Math.max(pitchRadius(teeth, module) - DEDENDUM, 0.1);
}

export function outerRadius(teeth: number, module = MODULE_MM): number {
  return pitchRadius(teeth, module) + ADDENDUM;
}

// --------------------------------------------------------------------------- //
// 2D profiles (returned as Vector2 loops) — extruded later                    //
// --------------------------------------------------------------------------- //

/** Ordered points of the full involute gear outline. Ported 1:1 from Python. */
export function involuteGearOutline(
  teeth: number,
  module = MODULE_MM,
  steps = 8,
): THREE.Vector2[] {
  const pa = THREE.MathUtils.degToRad(PRESSURE_ANGLE_DEG);
  const rPitch = pitchRadius(teeth, module);
  const rBase = rPitch * Math.cos(pa);
  const rOut = outerRadius(teeth, module);
  const rRoot = rootRadius(teeth, module);

  const invPa = Math.tan(pa) - pa;
  const halfTooth = Math.PI / (2 * teeth);

  const flank = (r: number): number => {
    const rr = Math.max(r, rBase);
    const alpha = Math.acos(rBase / rr);
    return halfTooth + invPa - (Math.tan(alpha) - alpha);
  };

  const rStart = Math.min(rRoot, rBase);
  const radii: number[] = [];
  for (let i = 0; i <= steps; i++) {
    radii.push(rStart + ((rOut - rStart) * i) / steps);
  }
  const toothStep = (2 * Math.PI) / teeth;

  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < teeth; k++) {
    const c = k * toothStep;
    for (const r of radii) {
      const th = c - flank(r);
      pts.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th)));
    }
    for (let i = radii.length - 1; i >= 0; i--) {
      const r = radii[i];
      const th = c + flank(r);
      pts.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th)));
    }
    const thLeft = c + flank(rStart);
    const thNext = c + toothStep - flank(rStart);
    for (let i = 1; i < 4; i++) {
      const th = thLeft + ((thNext - thLeft) * i) / 4;
      pts.push(new THREE.Vector2(rRoot * Math.cos(th), rRoot * Math.sin(th)));
    }
  }
  return pts;
}

/** Plus/cross-shaped bore matching a LEGO Technic axle (with clearance). */
export function crossAxleProfile(clearance = BORE_CLEARANCE): THREE.Vector2[] {
  const s = (AXLE_TIP_TO_TIP + clearance) / 2.0; // half span (arm tip)
  const a = (AXLE_ARM_WIDTH + clearance) / 2.0; // half arm width
  // 12 vertices of the plus, counter-clockwise (matches shapely union of two boxes)
  const v: [number, number][] = [
    [s, -a], [s, a], [a, a], [a, s], [-a, s], [-a, a],
    [-s, a], [-s, -a], [-a, -a], [-a, -s], [a, -s], [a, -a],
  ];
  return v.map(([x, y]) => new THREE.Vector2(x, y));
}

/** Round Technic pin hole (with clearance). */
export function pinHoleProfile(
  clearance = BORE_CLEARANCE,
  segments = 64,
): THREE.Vector2[] {
  const r = (PIN_HOLE_DIA + clearance) / 2.0;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const th = (2 * Math.PI * i) / segments;
    pts.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th)));
  }
  return pts;
}

/**
 * THE single source of truth for bore geometry — both gears.ts and
 * fitgauge.ts call this, never reimplement it (matches Python's bore_profile).
 */
export function boreProfile(
  boreType: BoreType,
  clearance = BORE_CLEARANCE,
): THREE.Vector2[] {
  if (boreType === "cross_axle") return crossAxleProfile(clearance);
  if (boreType === "pin_hole") return pinHoleProfile(clearance);
  throw new Error(`unknown bore_type: ${boreType}`);
}

/** Largest radial extent of the bore, for clash checks against tooth root. */
export function boreMaxRadius(
  boreType: BoreType,
  clearance = BORE_CLEARANCE,
): number {
  if (boreType === "cross_axle") return (AXLE_TIP_TO_TIP + clearance) / 2.0;
  if (boreType === "pin_hole") return (PIN_HOLE_DIA + clearance) / 2.0;
  throw new Error(`unknown bore_type: ${boreType}`);
}

// --------------------------------------------------------------------------- //
// Mesh helpers                                                                //
// --------------------------------------------------------------------------- //

/**
 * Weld coincident vertices so shared edges are truly shared — the equivalent
 * of trimesh's mesh.merge_vertices(). Returns an indexed geometry.
 *
 * IMPORTANT: three's mergeVertices only merges vertices identical in ALL
 * attributes, so cap vertices (normal 0,0,+-1) and wall vertices (radial
 * normals) at the same position would NOT weld, leaving an open seam. trimesh
 * welds by position only. So we strip normal/uv, weld by position, then
 * recompute normals — matching the Python's watertight result.
 */
export function weld(geometry: THREE.BufferGeometry, tolerance = 1e-4): THREE.BufferGeometry {
  const g = (geometry.index ? geometry : geometry.toNonIndexed()).clone();
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const merged = mergeVertices(g, tolerance);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Watertight / manifold test: every edge must be shared by exactly two
 * triangles. Mirrors the intent of trimesh's is_watertight, and is the
 * explicit check the CSG-risk requirement calls for.
 */
export function isWatertight(geometry: THREE.BufferGeometry): boolean {
  const welded = geometry.index ? geometry : weld(geometry);
  const index = welded.getIndex();
  if (!index) return false;
  const arr = index.array;
  const edgeCount = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < arr.length; i += 3) {
    const a = arr[i], b = arr[i + 1], c = arr[i + 2];
    if (a === b || b === c || a === c) continue; // skip degenerate
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = key(u, v);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }
  for (const count of edgeCount.values()) {
    if (count !== 2) return false;
  }
  return edgeCount.size > 0;
}
