/**
 * Shared geometry helpers for a general-purpose involute spur gear generator.
 *
 * The involute tooth math (pitch / base / addendum / dedendum circle
 * relationships) is unchanged from the original tool — only the constraints
 * around legal parameter values were opened up. Module and pressure angle are
 * now free inputs rather than locked to the LEGO system.
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Standard full-depth involute proportions (multiples of the module).
export const ADDENDUM_FACTOR = 1.0;
export const DEDENDUM_FACTOR = 1.25;

// Below this, involute teeth undercut badly at 20 deg and stop meshing cleanly.
export const MIN_TEETH = 6;

export const DEFAULT_PRESSURE_ANGLE = 20; // degrees; 14.5 is the legacy option

// --------------------------------------------------------------------------- //
// Radii (all take an explicit module — nothing is locked to 1 any more)       //
// --------------------------------------------------------------------------- //
export function pitchRadius(teeth: number, module: number): number {
  return (module * teeth) / 2.0;
}
export function rootRadius(teeth: number, module: number): number {
  return Math.max(pitchRadius(teeth, module) - DEDENDUM_FACTOR * module, 0.1);
}
export function outerRadius(teeth: number, module: number): number {
  return pitchRadius(teeth, module) + ADDENDUM_FACTOR * module;
}

// --------------------------------------------------------------------------- //
// 2D profiles (returned as Vector2 loops) — extruded later                    //
// --------------------------------------------------------------------------- //

/** Ordered points of the full involute gear outline. */
export function involuteGearOutline(
  teeth: number,
  module: number,
  pressureAngleDeg: number = DEFAULT_PRESSURE_ANGLE,
  steps = 8,
): THREE.Vector2[] {
  const pa = THREE.MathUtils.degToRad(pressureAngleDeg);
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
  for (let i = 0; i <= steps; i++) radii.push(rStart + ((rOut - rStart) * i) / steps);
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

/** Round bore / any concentric circle, as an ordered point loop. */
export function circleProfile(radius: number, segments = 64): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const th = (2 * Math.PI * i) / segments;
    pts.push(new THREE.Vector2(radius * Math.cos(th), radius * Math.sin(th)));
  }
  return pts;
}

/**
 * Round bore with one flat side (a "D" bore) for D-shafts. `flatDepth` is how
 * much material the flat removes from the round edge (mm). The round part still
 * has the full `radius`; the closing edge of the returned loop forms the flat.
 */
export function dFlatProfile(radius: number, flatDepth: number, segments = 64): THREE.Vector2[] {
  const xf = radius - flatDepth; // x of the flat chord
  if (flatDepth <= 0 || xf <= -radius) return circleProfile(radius, segments);
  const thetaF = Math.acos(Math.max(-1, Math.min(1, xf / radius)));
  const span = 2 * Math.PI - 2 * thetaF; // major arc, skipping the flat side
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = thetaF + (span * i) / segments;
    pts.push(new THREE.Vector2(radius * Math.cos(a), radius * Math.sin(a)));
  }
  return pts;
}

export function signedArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

/** Clockwise Path for use as an ExtrudeGeometry hole (outer contour is CCW). */
export function asHole(points: THREE.Vector2[]): THREE.Path {
  const cw = signedArea(points) > 0 ? points.slice().reverse() : points;
  return new THREE.Path(cw);
}

// --------------------------------------------------------------------------- //
// Mesh helpers                                                                //
// --------------------------------------------------------------------------- //

/**
 * Weld coincident vertices by POSITION (three's mergeVertices otherwise keeps
 * cap/wall vertices apart because their normals differ, leaving an open seam).
 * Strip normals, weld, recompute — matching a trimesh-style watertight weld.
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
 * Watertight / manifold test: every edge shared by exactly two triangles.
 * An already-indexed geometry is checked as-is (so a mesh assembled from two
 * independently-welded closed shells still passes).
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
    if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = key(u, v);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }
  for (const count of edgeCount.values()) if (count !== 2) return false;
  return edgeCount.size > 0;
}
