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

// Upper bound accepted for profileShift. Teeth would start overlapping the
// next tooth's gap around x ~= pi/(4*tan(pa)) (~2.16 at 20deg) — 1.2 stays
// well clear of that with a comfortable margin for any allowed pressure angle.
export const MAX_PROFILE_SHIFT = 1.2;

// --------------------------------------------------------------------------- //
// Radii (all take an explicit module — nothing is locked to 1 any more)       //
// --------------------------------------------------------------------------- //
export function pitchRadius(teeth: number, module: number): number {
  return (module * teeth) / 2.0;
}
/** `profileShift` (x, a module multiplier) raises the root: standard formula
 *  rf = r - m*(hf* - x). Positive x thickens the tooth base (fixes undercut). */
export function rootRadius(teeth: number, module: number, profileShift = 0): number {
  return Math.max(pitchRadius(teeth, module) - (DEDENDUM_FACTOR - profileShift) * module, 0.1);
}
/** ra = r + m*(ha* + x) — positive shift also pushes the tip further out. */
export function outerRadius(teeth: number, module: number, profileShift = 0): number {
  return pitchRadius(teeth, module) + (ADDENDUM_FACTOR + profileShift) * module;
}

/**
 * Minimum profile shift (x) needed so a gear with this tooth count doesn't
 * undercut at the given pressure angle: x_min = ha* - z*sin²(pa)/2 (standard
 * full-depth involute formula). 0 (clamped) once z is large enough on its
 * own — the classic "17-tooth rule" at 20° falls out of this exactly.
 */
export function minProfileShift(
  teeth: number,
  pressureAngleDeg: number = DEFAULT_PRESSURE_ANGLE,
  addendumFactor = ADDENDUM_FACTOR,
): number {
  const s = Math.sin(THREE.MathUtils.degToRad(pressureAngleDeg));
  return Math.max(0, addendumFactor - (teeth * s * s) / 2);
}

/**
 * Whether a gear at this shift still undercuts (shift below the minimum).
 * A small practical tolerance (0.01) absorbs the classic "17-tooth rule"
 * folk boundary — the exact theoretical cutoff at 20° is 18 teeth (17 needs
 * a residual shift of ~0.006, negligible below print resolution).
 */
export function hasUndercut(
  teeth: number,
  pressureAngleDeg: number = DEFAULT_PRESSURE_ANGLE,
  profileShift = 0,
): boolean {
  return profileShift + 0.01 < minProfileShift(teeth, pressureAngleDeg);
}

// --------------------------------------------------------------------------- //
// 2D profiles (returned as Vector2 loops) — extruded later                    //
// --------------------------------------------------------------------------- //

/**
 * Ordered points of the full involute gear outline.
 *
 * `backlash` (mm) thins each tooth's circular thickness at the pitch line by
 * that amount (each flank pulled in by backlash/2), widening the gap so a
 * printed pair meshes with clearance at the standard centre distance instead
 * of binding. 0 = mathematically exact teeth.
 *
 * `profileShift` (x, standard addendum-modification coefficient) thickens
 * the tooth base and pushes the tip out — the fix for undercut on low tooth
 * counts. See `minProfileShift()` for the value that just eliminates it.
 */
export function involuteGearOutline(
  teeth: number,
  module: number,
  pressureAngleDeg: number = DEFAULT_PRESSURE_ANGLE,
  steps = 8,
  backlash = 0,
  profileShift = 0,
): THREE.Vector2[] {
  const pa = THREE.MathUtils.degToRad(pressureAngleDeg);
  const rPitch = pitchRadius(teeth, module);
  const rBase = rPitch * Math.cos(pa);
  const rRoot = rootRadius(teeth, module, profileShift);

  const invPa = Math.tan(pa) - pa;
  // pull each flank in by the angular equivalent of backlash/2 at the pitch circle,
  // and out again by the profile-shift's extra rack travel (2*x*tan(pa)/teeth)
  const dTheta = backlash / 2 / rPitch;
  const halfTooth = Math.PI / (2 * teeth) - dTheta + (2 * profileShift * Math.tan(pa)) / teeth;

  const flank = (r: number): number => {
    const rr = Math.max(r, rBase);
    const alpha = Math.acos(rBase / rr);
    return halfTooth + invPa - (Math.tan(alpha) - alpha);
  };

  // A large profile shift on a low tooth count can taper the tooth to a point
  // before reaching the nominal addendum radius, and past that the flank
  // angle goes negative — the outline crosses itself (self-intersecting
  // polygon) and the extrude produces a broken, non-watertight mesh. Real
  // gear design caps the addendum the same way ("pointed tooth" limit): clamp
  // the tip radius so the topland keeps a minimum sliver of width instead of
  // closing to (or past) a point.
  const minTopHalfAngle = 0.01; // rad (~0.6deg) — a thin but real, non-crossing tip
  let rOut = outerRadius(teeth, module, profileShift);
  if (flank(rOut) < minTopHalfAngle) {
    let lo = rBase, hi = rOut;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (flank(mid) >= minTopHalfAngle) lo = mid; else hi = mid;
    }
    rOut = lo;
  }

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
