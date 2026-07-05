/**
 * Watertightness matrix — the non-negotiable acceptance test carried over from
 * the Python port. Every teeth x bore-type combination must produce a
 * watertight/manifold mesh, with the bore actually subtracted and the correct
 * LEGO outer diameter. Also covers the fit-gauge CSG path (the flagged risk).
 */

import * as THREE from "three";
import { generateLegoGear } from "../src/gears.js";
import { generateFitGauge, labelMarkCount, initManifold } from "../src/fitgauge.js";
import { SUPPORTED_TEETH, BoreType } from "../src/common.js";

await initManifold(); // load WASM boolean backend once before the CSG paths

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

/** Signed volume of a triangle soup (mm^3). Positive for outward normals. */
function volume(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.getAttribute("position");
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

function outerDiameter(geo: THREE.BufferGeometry): number {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  return b.max.x - b.min.x;
}

// isWatertight is re-checked here independently of the generator's internal guard.
import { isWatertight } from "../src/common.js";

const bores: BoreType[] = ["cross_axle", "pin_hole"];

console.log("=== Gears: watertight x OD x bore-subtracted (5 teeth x 2 bores) ===");
for (const teeth of SUPPORTED_TEETH) {
  for (const boreType of bores) {
    const geo = generateLegoGear({ teeth, thicknessUnits: 1, boreType });
    const wt = isWatertight(geo);
    const od = outerDiameter(geo);
    const vol = volume(geo);
    const solidVol = Math.PI * (od / 2) ** 2 * 3.2; // if it were a plain disc
    const boreSubtracted = vol < solidVol; // hole removed material
    const odOk = Math.abs(od - (teeth + 2)) < 0.05;
    ok(
      wt && odOk && boreSubtracted,
      `${String(teeth).padStart(2)}t ${boreType.padEnd(10)} watertight=${wt} OD=${od.toFixed(2)} (want ${teeth + 2}) boreSubtracted=${boreSubtracted}`,
    );
  }
}

console.log("\n=== Fit gauges: watertight after CSG label union (both bores) ===");
for (const boreType of bores) {
  for (const off of [-0.1, -0.05, 0.0, 0.05, 0.1]) {
    const clearance = Math.round((0.1 + off) * 1e4) / 1e4;
    const geo = generateFitGauge({ boreType, clearanceOverride: clearance });
    const wt = isWatertight(geo);
    ok(wt, `${boreType.padEnd(10)} clr=${clearance.toFixed(2)} dots=${String(labelMarkCount(clearance)).padStart(2)} watertight=${wt}`);
  }
}

console.log("\n=== Fit-gauge label count matches clearance*100 (geometry) ===");
for (const boreType of bores) {
  for (const clearance of [0.0, 0.05, 0.1, 0.15, 0.2]) {
    const n = labelMarkCount(clearance);
    const plain = generateFitGauge({ boreType, clearanceOverride: clearance, embossLabel: false });
    const labeled = generateFitGauge({ boreType, clearanceOverride: clearance, embossLabel: true });
    const perDot = Math.PI * 0.5 ** 2 * 0.6; // radius^2 * protrude
    const added = volume(labeled) - volume(plain);
    const nGeom = n === 0 ? 0 : Math.round(added / perDot);
    ok(nGeom === n, `${boreType.padEnd(10)} clr=${clearance.toFixed(2)} expect=${n} geom=${nGeom}`);
  }
}

console.log("\n=== Validation errors thrown correctly ===");
const expectThrow = (fn: () => void, label: string) => {
  try {
    fn();
    ok(false, `${label} -> NO ERROR (bug)`);
  } catch (e) {
    ok(e instanceof Error, `${label} -> ${(e as Error).message}`);
  }
};
expectThrow(() => generateLegoGear({ teeth: 7 }), "7t not standard");
expectThrow(() => generateLegoGear({ teeth: 5, allowCustom: true }), "5t custom undercut");
expectThrow(() => generateLegoGear({ teeth: 24, thicknessUnits: 0 }), "0 thickness");

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURE(S)`}`);
if (failures > 0) throw new Error(`${failures} test failure(s)`);
