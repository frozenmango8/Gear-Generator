/**
 * Cross-axle / pin-hole fit gauges (ported 1:1 from generator/fitgauge.py).
 *
 * The bore is punched with the SAME boreProfile() the gears use (2D hole).
 * The embossed dot labels are the only place a 3D boolean is needed, mirroring
 * the Python's trimesh.boolean.union — done here with three-bvh-csg.
 */

import * as THREE from "three";
import {
  BoreType,
  PLATE_MM,
  BORE_CLEARANCE,
  boreProfile,
  boreMaxRadius,
  weld,
  isWatertight,
} from "./common.js";
import { unionAll } from "./csg.js";

export { initManifold } from "./csg.js";

// Embossed label: raised dots on the top face, count == clearance * 100.
export const LABEL_DOT_RADIUS = 0.5; // mm
export const LABEL_DOT_PROTRUDE = 0.6; // mm raised above the top face
export const LABEL_DOT_EMBED = 0.3; // mm sunk into the disc for a clean union

export interface FitGaugeParams {
  boreType?: BoreType; // default "cross_axle"
  diameter?: number; // default 12 mm
  thicknessUnits?: number; // default 1 (multiples of PLATE_MM)
  clearanceOverride?: number | null; // null/undefined -> BORE_CLEARANCE
  embossLabel?: boolean; // default true
}

function clearanceOf(p: FitGaugeParams): number {
  return p.clearanceOverride ?? BORE_CLEARANCE;
}
function thicknessMmOf(p: FitGaugeParams): number {
  return (p.thicknessUnits ?? 1.0) * PLATE_MM;
}
function diameterOf(p: FitGaugeParams): number {
  return p.diameter ?? 12.0;
}

/** Number of raised dots that encode a clearance value (clearance * 100). */
export function labelMarkCount(clearance: number): number {
  return Math.max(0, Math.round(clearance * 100));
}

/** Radius at which to place the label dots: clear of the bore and the rim. */
export function labelRadius(params: FitGaugeParams): number {
  const rDisc = diameterOf(params) / 2.0;
  const rBore = boreMaxRadius(params.boreType ?? "cross_axle", clearanceOf(params));
  let r = (rBore + rDisc) / 2.0;
  r = Math.max(r, rBore + LABEL_DOT_RADIUS + 0.5); // off the bore/fit area
  r = Math.min(r, rDisc - LABEL_DOT_RADIUS - 0.4); // inside the rim
  return r;
}

function circlePoints(radius: number, segments = 96): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const th = (2 * Math.PI * i) / segments;
    pts.push(new THREE.Vector2(radius * Math.cos(th), radius * Math.sin(th)));
  }
  return pts;
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
function asHole(points: THREE.Vector2[]): THREE.Path {
  const cw = signedArea(points) > 0 ? points.slice().reverse() : points;
  return new THREE.Path(cw);
}

/** Union raised dots onto the disc top face encoding clearance * 100. */
function embossLabel(disc: THREE.BufferGeometry, params: FitGaugeParams): THREE.BufferGeometry {
  const n = labelMarkCount(clearanceOf(params));
  if (n === 0) return disc;

  const rLabel = labelRadius(params);
  const height = LABEL_DOT_EMBED + LABEL_DOT_PROTRUDE;
  const zCenter = thicknessMmOf(params) - LABEL_DOT_EMBED + height / 2.0;

  const dots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n + Math.PI / 2; // start at top
    const cyl = new THREE.CylinderGeometry(LABEL_DOT_RADIUS, LABEL_DOT_RADIUS, height, 24);
    cyl.rotateX(Math.PI / 2); // three cylinders are Y-axis; align to Z
    cyl.translate(rLabel * Math.cos(ang), rLabel * Math.sin(ang), zCenter); // bake position
    dots.push(cyl);
  }
  // manifold-3d guarantees a watertight union (three-bvh-csg/three-csg-ts did not)
  return unionAll(disc, dots);
}

/**
 * Generate a thin disc with a bore punched through it (+ optional dot label).
 * Throws Error on invalid parameters or a non-watertight result.
 */
export function generateFitGauge(params: FitGaugeParams): THREE.BufferGeometry {
  const boreType = params.boreType ?? "cross_axle";
  if (boreType !== "cross_axle" && boreType !== "pin_hole") {
    throw new Error(`Unknown bore type ${boreType}; use cross_axle or pin_hole.`);
  }
  const diameter = diameterOf(params);
  if (diameter <= 0) throw new Error("Diameter must be positive.");
  if ((params.thicknessUnits ?? 1.0) <= 0) {
    throw new Error("Thickness must be a positive number of plate units.");
  }

  const clearance = clearanceOf(params);
  const rBore = boreMaxRadius(boreType, clearance);
  if (rBore >= diameter / 2.0) {
    throw new Error(
      `Bore (r=${rBore.toFixed(2)} mm) is larger than the disc ` +
        `(r=${(diameter / 2.0).toFixed(2)} mm). Increase diameter.`,
    );
  }

  const shape = new THREE.Shape(circlePoints(diameter / 2.0));
  shape.holes.push(asHole(boreProfile(boreType, clearance)));

  const discGeo = weld(
    new THREE.ExtrudeGeometry(shape, {
      depth: thicknessMmOf(params),
      bevelEnabled: false,
      steps: 1,
    }),
  );

  const mesh = (params.embossLabel ?? true) ? embossLabel(discGeo, params) : discGeo;

  if (!isWatertight(mesh)) {
    throw new Error("Internal error: fit gauge mesh is not watertight.");
  }
  return mesh;
}

function fmt(value: number): string {
  return value.toFixed(2);
}

export interface SweepItem {
  clearance: number;
  filename: string;
  geometry: THREE.BufferGeometry;
}

/** Sweep clearance around BORE_CLEARANCE. Returns geometry + suggested filename. */
export function clearanceSweep(
  boreType: BoreType = "cross_axle",
  offsets: number[] = [-0.1, -0.05, 0.0, 0.05, 0.1],
  diameter = 12.0,
  thicknessUnits = 1.0,
): SweepItem[] {
  return offsets.map((off) => {
    const clearance = Math.round((BORE_CLEARANCE + off) * 1e4) / 1e4;
    const geometry = generateFitGauge({
      boreType,
      diameter,
      thicknessUnits,
      clearanceOverride: clearance,
    });
    return {
      clearance,
      filename: `fitgauge_${boreType}_clearance_${fmt(clearance)}.stl`,
      geometry,
    };
  });
}
