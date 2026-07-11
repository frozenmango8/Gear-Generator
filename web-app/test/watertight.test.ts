/**
 * Watertightness + dimensional-correctness matrix for the general-purpose
 * involute gear generator. Swept across a representative module x teeth x bore
 * x pressure-angle space (with and without a hub) — not the old fixed sizes.
 */

import * as THREE from "three";
import { generateInvoluteGear, GearValidationError, BoreShape } from "../src/gears.js";
import { generateShaft, ShaftError } from "../src/shaft.js";
import { isWatertight, outerRadius, rootRadius, pitchRadius, involuteGearOutline } from "../src/common.js";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

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
/** True tip diameter = 2x the largest vertex radius (a tooth tip rarely lands
 *  exactly on an axis, so a bounding-box width underreports it). */
function tipDiameter(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute("position");
  let maxR = 0;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i));
    if (r > maxR) maxR = r;
  }
  return 2 * maxR;
}

const modules = [0.5, 1, 1.5, 2, 3, 5];
const teethSet = [6, 8, 12, 17, 20, 40];
const angles = [14.5, 20];

console.log("=== Gears: watertight x OD x bore across module x teeth x PA ===");
for (const module of modules) {
  for (const teeth of teethSet) {
    for (const pressureAngle of angles) {
      // a bore that stays clear of the root (60% of the max legal bore)
      const bore = +(2 * rootRadius(teeth, module) * 0.6).toFixed(2);
      const geo = generateInvoluteGear({ module, teeth, pressureAngle, boreDiameter: bore, thickness: 4 });
      const wt = isWatertight(geo);
      const od = tipDiameter(geo);
      const wantOD = 2 * outerRadius(teeth, module); // = module * (teeth + 2)
      const odOk = Math.abs(od - wantOD) < Math.max(0.02, module * 0.01);
      const pitchDia = od - 2 * module; // pitch diameter must equal module * teeth
      const pitchOk = Math.abs(pitchDia - module * teeth) < Math.max(0.02, module * 0.01);
      const boreSubtracted = volume(geo) < Math.PI * (od / 2) ** 2 * 4;
      ok(
        wt && odOk && pitchOk && boreSubtracted,
        `m=${module} ${String(teeth).padStart(2)}t PA=${pressureAngle} bore=${bore}` +
          ` watertight=${wt} OD=${od.toFixed(2)}(want ${wantOD.toFixed(2)}) pitchDia=${pitchDia.toFixed(1)}(want ${(module * teeth).toFixed(1)})`,
      );
    }
  }
}

console.log("\n=== Hub option: watertight + adds material above the gear ===");
for (const [module, teeth] of [[1, 20], [2, 16], [1.5, 30]] as const) {
  const bore = 4;
  const thickness = 4;
  const plain = generateInvoluteGear({ module, teeth, boreDiameter: bore, thickness });
  // default hubHeight (omitted) should fall back to thickness -> top = thickness + thickness
  const hubbed = generateInvoluteGear({ module, teeth, boreDiameter: bore, hubDiameter: bore + 6, thickness });
  hubbed.computeBoundingBox();
  const zTop = hubbed.boundingBox!.max.z;
  const wantTop = thickness + thickness;
  const grew = volume(hubbed) > volume(plain) && Math.abs(zTop - wantTop) < 0.6; // embed tolerance
  ok(isWatertight(hubbed) && grew, `m=${module} ${teeth}t + hub (default height): watertight=${isWatertight(hubbed)} topZ=${zTop.toFixed(1)}mm (want ~${wantTop})`);
}

console.log("\n=== Hub height: independent of thickness, exact value ===");
for (const [module, teeth, thickness, hubHeight] of [[2, 20, 4, 12], [1, 24, 6, 2], [1.5, 16, 8, 25]] as const) {
  const bore = 4;
  const g = generateInvoluteGear({ module, teeth, boreDiameter: bore, hubDiameter: bore + 6, hubHeight, thickness });
  g.computeBoundingBox();
  const zTop = g.boundingBox!.max.z;
  const wantTop = thickness + hubHeight;
  const ok1 = Math.abs(zTop - wantTop) < 0.6 && isWatertight(g);
  ok(ok1, `m=${module} ${teeth}t thickness=${thickness} hubHeight=${hubHeight}: topZ=${zTop.toFixed(1)} (want ~${wantTop}) watertight=${isWatertight(g)}`);
}

console.log("\n=== D-flat bore: watertight + flat present + runs through hub ===");
for (const [module, teeth, bore, flat] of [[2, 20, 6, 1.5], [1, 16, 4, 1], [3, 24, 8, 2.5]] as const) {
  const round = generateInvoluteGear({ module, teeth, boreDiameter: bore, thickness: 4 });
  const dflat = generateInvoluteGear({ module, teeth, boreDiameter: bore, boreShape: "d_flat", flatDepth: flat, thickness: 4 });
  // the flat leaves material a round bore would remove -> more volume than round
  const flatPresent = volume(dflat) > volume(round) + 0.01;
  ok(isWatertight(dflat) && flatPresent,
    `m=${module} ${teeth}t bore=${bore} flat=${flat}: watertight=${isWatertight(dflat)} flatPresent=${flatPresent}`);
  const dflatHub = generateInvoluteGear({ module, teeth, boreDiameter: bore, boreShape: "d_flat", flatDepth: flat, hubDiameter: bore + 6, thickness: 4 });
  ok(isWatertight(dflatHub), `  ...with hub: watertight=${isWatertight(dflatHub)}`);
}

console.log("\n=== Backlash: thins teeth by the requested amount, stays watertight ===");
for (const [module, teeth] of [[2, 20], [1, 16], [3, 24]] as const) {
  const bl = 0.2;
  const steps = 8;
  // tooth 0 tip flanks are at outline indices `steps` and `steps+1`
  const tipAngWidth = (o: THREE.Vector2[]) =>
    Math.abs(Math.atan2(o[steps + 1].y, o[steps + 1].x) - Math.atan2(o[steps].y, o[steps].x));
  const w0 = tipAngWidth(involuteGearOutline(teeth, module, 20, steps, 0));
  const wB = tipAngWidth(involuteGearOutline(teeth, module, 20, steps, bl));
  const reduction = w0 - wB; // angular tooth-width reduction at the tip
  const expected = bl / pitchRadius(teeth, module); // = 2 * (backlash/2/pitchR)
  const amountOk = Math.abs(reduction - expected) < 1e-4;
  const g = generateInvoluteGear({ module, teeth, boreDiameter: 4, thickness: 4, backlash: bl });
  ok(amountOk && isWatertight(g),
    `m=${module} ${teeth}t backlash=${bl}: reduction=${reduction.toFixed(4)} rad (want ${expected.toFixed(4)}) watertight=${isWatertight(g)}`);
}

console.log("\n=== Matching shaft: watertight + fits the bore + correct length ===");
for (const [boreDiameter, shape, flat] of [[6, "round", 0], [6, "d_flat", 1.5], [10, "d_flat", 3]] as const) {
  const clr = 0.2;
  const shaft = generateShaft({ boreDiameter, boreShape: shape as BoreShape, flatDepth: flat, length: 25, clearance: clr });
  const wt = isWatertight(shaft);
  const shaftR = tipDiameter(shaft) / 2; // largest radius of the shaft cross-section
  const fits = shaftR <= boreDiameter / 2 - clr + 0.02; // smaller than the bore by ~clearance
  shaft.computeBoundingBox();
  const len = shaft.boundingBox!.max.z - shaft.boundingBox!.min.z;
  ok(wt && fits && Math.abs(len - 25) < 0.01,
    `bore=${boreDiameter} ${shape}: watertight=${wt} shaftR=${shaftR.toFixed(2)}(<= ${(boreDiameter / 2 - clr).toFixed(2)}) len=${len.toFixed(1)}`);
}

console.log("\n=== Validation errors ===");
const mustThrow = (fn: () => void, label: string) => {
  try {
    fn();
    ok(false, `${label} -> NO ERROR (bug)`);
  } catch (e) {
    ok(e instanceof GearValidationError, `${label} -> ${(e as Error).message}`);
  }
};
mustThrow(() => generateInvoluteGear({ module: 1, teeth: 5, thickness: 4 }), "5 teeth (< 6)");
mustThrow(() => generateInvoluteGear({ module: 0, teeth: 20, thickness: 4 }), "module 0");
mustThrow(() => generateInvoluteGear({ module: 1, teeth: 20, thickness: 0 }), "thickness 0");
mustThrow(
  () => generateInvoluteGear({ module: 1, teeth: 20, boreDiameter: 100, thickness: 4 }),
  "bore into root",
);
mustThrow(
  () => generateInvoluteGear({ module: 1, teeth: 20, boreDiameter: 5, hubDiameter: 3, thickness: 4 }),
  "hub <= bore",
);
mustThrow(
  () => generateInvoluteGear({ module: 1, teeth: 20, boreDiameter: 4, hubDiameter: 10, hubHeight: 0, thickness: 4 }),
  "hubHeight 0",
);
mustThrow(
  () => generateInvoluteGear({ module: 2, teeth: 20, boreDiameter: 6, boreShape: "d_flat", flatDepth: 0, thickness: 4 }),
  "d_flat flatDepth 0",
);
mustThrow(
  () => generateInvoluteGear({ module: 2, teeth: 20, boreDiameter: 6, boreShape: "d_flat", flatDepth: 6, thickness: 4 }),
  "d_flat flatDepth >= bore",
);
mustThrow(
  () => generateInvoluteGear({ module: 1, teeth: 20, thickness: 4, backlash: 2 }),
  "backlash too large",
);

const mustThrowShaft = (fn: () => void, label: string) => {
  try {
    fn();
    ok(false, `${label} -> NO ERROR (bug)`);
  } catch (e) {
    ok(e instanceof ShaftError, `${label} -> ${(e as Error).message}`);
  }
};
mustThrowShaft(() => generateShaft({ boreDiameter: 0, length: 20 }), "shaft with no bore");
mustThrowShaft(() => generateShaft({ boreDiameter: 6, length: 0 }), "shaft length 0");
mustThrowShaft(() => generateShaft({ boreDiameter: 0.4, length: 20, clearance: 0.2 }), "bore too small for shaft");

// a valid custom combo the old LEGO tool could never make
const exotic = generateInvoluteGear({ module: 3.5, teeth: 11, pressureAngle: 14.5, boreDiameter: 6, thickness: 7 });
ok(isWatertight(exotic), `exotic m3.5 11t PA14.5 -> watertight=${isWatertight(exotic)}`);

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURE(S)`}`);
if (failures > 0) throw new Error(`${failures} test failure(s)`);
