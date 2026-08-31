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
 * Points of a SINGLE involute tooth, centred on angle 0 (up-flank, down-flank,
 * then a short root arc reaching the angular midpoint before the next tooth
 * would start). `shapeTeeth` drives the involute curvature (angular width,
 * base/root/tip radii) and need not be an integer — bevel gears evaluate this
 * at a "virtual" (Tredgold) tooth count distinct from the real, integer tooth
 * count the gear actually has. Spur gears call this with shapeTeeth == the
 * real tooth count, which is exactly the original single-outline behaviour.
 *
 * `backlash` / `profileShift` have the same meaning as `involuteGearOutline`.
 * Also returns the resolved `rRoot`/`rOut` (post pointed-tip clamp) since
 * callers (bevel tooth scaling) need those radii too.
 */
export function singleToothOutline(
  shapeTeeth: number,
  module: number,
  pressureAngleDeg: number = DEFAULT_PRESSURE_ANGLE,
  steps = 8,
  backlash = 0,
  profileShift = 0,
): { points: THREE.Vector2[]; rRoot: number; rOut: number; toothStep: number } {
  const pa = THREE.MathUtils.degToRad(pressureAngleDeg);
  const rPitch = pitchRadius(shapeTeeth, module);
  const rBase = rPitch * Math.cos(pa);
  const rRoot = rootRadius(shapeTeeth, module, profileShift);

  const invPa = Math.tan(pa) - pa;
  // pull each flank in by the angular equivalent of backlash/2 at the pitch circle,
  // and out again by the profile-shift's extra rack travel (2*x*tan(pa)/shapeTeeth)
  const dTheta = backlash / 2 / rPitch;
  const halfTooth = Math.PI / (2 * shapeTeeth) - dTheta + (2 * profileShift * Math.tan(pa)) / shapeTeeth;

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
  let rOut = outerRadius(shapeTeeth, module, profileShift);
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
  const toothStep = (2 * Math.PI) / shapeTeeth;

  const points: THREE.Vector2[] = [];
  for (const r of radii) {
    const th = -flank(r);
    points.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th)));
  }
  for (let i = radii.length - 1; i >= 0; i--) {
    const r = radii[i];
    const th = flank(r);
    points.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th)));
  }
  // The root arc is drawn at rStart, NOT the raw rRoot formula value. When
  // rRoot > rBase (routine once teeth get large enough relative to module —
  // ~42 teeth at module 1, 20°; Tredgold's virtual tooth count for a steep
  // bevel ratio reaches it far more easily), rStart = rBase, but the flank
  // curve's innermost SAMPLED point is also at rStart. Drawing the root arc
  // at the larger rRoot instead would jump radially outward right at that
  // transition — usually a harmless little shoulder, but confirmed to
  // self-intersect the polygon when combined with a pointed-tip clamp that
  // pulls rOut down close to rRoot (found via an extreme bevel virtual-tooth
  // case: 40t meshing with 8t). Using rStart keeps the boundary continuous
  // for every parameter combination, not just the ones already tested.
  const thLeft = flank(rStart);
  const thNext = toothStep - flank(rStart);
  for (let i = 1; i < 4; i++) {
    const th = thLeft + ((thNext - thLeft) * i) / 4;
    points.push(new THREE.Vector2(rStart * Math.cos(th), rStart * Math.sin(th)));
  }
  // rStart is also the geometrically TRUE (effective) root of the drawn
  // shape once this clamp is in play, so return it (not the raw rRoot) —
  // callers using this for bore-safety limits (bevelMaxBoreDiameter) must
  // check against what's actually drawn, not a fictional larger value.
  return { points, rRoot: rStart, rOut, toothStep };
}

/** Rotate a point loop by `angle` radians about the origin. */
export function rotatePoints(points: THREE.Vector2[], angle: number): THREE.Vector2[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return points.map((p) => new THREE.Vector2(p.x * cos - p.y * sin, p.x * sin + p.y * cos));
}

/**
 * Ordered points of the full involute gear outline: `teeth` real, evenly-
 * spaced copies of `singleToothOutline(teeth, ...)`. See that function for
 * what `backlash` / `profileShift` do.
 */
export function involuteGearOutline(
  teeth: number,
  module: number,
  pressureAngleDeg: number = DEFAULT_PRESSURE_ANGLE,
  steps = 8,
  backlash = 0,
  profileShift = 0,
): THREE.Vector2[] {
  const { points: tooth, toothStep } = singleToothOutline(teeth, module, pressureAngleDeg, steps, backlash, profileShift);
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < teeth; k++) pts.push(...rotatePoints(tooth, k * toothStep));
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
 *
 * mergeVertices() reads an index when there is one and falls back to the raw
 * position count when there isn't, so non-indexed input (everything out of
 * ExtrudeGeometry) needs no conversion first — calling toNonIndexed() on it
 * only logged "BufferGeometry is already non-indexed" and returned it as-is.
 */
export function weld(geometry: THREE.BufferGeometry, tolerance = 1e-4): THREE.BufferGeometry {
  const g = geometry.clone();
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
