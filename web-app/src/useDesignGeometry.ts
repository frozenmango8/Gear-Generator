/**
 * All the geometry the GUI displays, derived from the current parameters.
 *
 * Generation is pure and synchronous (params in, BufferGeometry out), so this
 * is useMemo, not useEffect + setState. That matters beyond tidiness: the old
 * effects closed over a `params` object rebuilt on every render, so their
 * dependency arrays had to be hand-written and silenced with
 * `eslint-disable react-hooks/exhaustive-deps` — a list that was correct only
 * for as long as someone remembered to extend it when a parameter was added.
 * Depending on the individual primitive fields instead makes the lists
 * complete and machine-checkable, and drops a render (state set from an effect
 * always costs a second pass).
 *
 * Each geometry is built only in the mode that shows it — switching modes
 * recomputes, so nothing is generated to sit unused.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { rootRadius } from "./common.js";
import { generateInvoluteGear, GearParams, BoreShape } from "./gears.js";
import { generateShaft } from "./shaft.js";
import { generateBevelGear } from "./bevel.js";

export type Mode = "single" | "pair" | "bevel";

export interface DesignInputs {
  mode: Mode;
  module: number;
  teeth: number;
  teethB: number;
  pressureAngle: number;
  /** Bore for the parallel-shaft modes, already clamped to its limit. */
  bore: number;
  /** Bore for bevel mode, already clamped to the (tighter) bevel limit. */
  bevelBore: number;
  boreShape: BoreShape;
  flatDepth: number;
  hub: number;
  hubHeight: number;
  thickness: number;
  backlash: number;
  profileShift: number;
  faceWidth: number;
  shaftLength: number;
  shaftClearance: number;
  showShaft: boolean;
}

export interface DesignGeometry {
  gear: THREE.BufferGeometry | null;
  gearB: THREE.BufferGeometry | null;
  bevelA: THREE.BufferGeometry | null;
  bevelB: THREE.BufferGeometry | null;
  shaft: THREE.BufferGeometry | null;
  /** Validation message from whichever gear in the current mode failed —
   *  including gear B, so a disabled download button always has a reason. */
  error: string;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Build one geometry, turning a validation throw into a message. */
function attempt(build: () => THREE.BufferGeometry): { geo: THREE.BufferGeometry | null; error: string } {
  try {
    return { geo: build(), error: "" };
  } catch (e) {
    return { geo: null, error: message(e) };
  }
}

const NONE = { geo: null, error: "" };

export function useDesignGeometry(i: DesignInputs): DesignGeometry {
  // Gear A — the single-gear download, and the driver in pair mode. Hub and
  // profile shift are single-gear-only (see the README on why a meshing pair's
  // shifts would have to balance).
  const gear = useMemo(() => {
    if (i.mode === "bevel") return NONE;
    const params: GearParams = {
      module: i.module,
      teeth: i.teeth,
      pressureAngle: i.pressureAngle,
      boreDiameter: i.bore,
      boreShape: i.boreShape,
      flatDepth: i.flatDepth,
      hubDiameter: i.mode === "single" ? i.hub : 0,
      hubHeight: i.hubHeight,
      thickness: i.thickness,
      backlash: i.backlash,
      profileShift: i.mode === "single" ? i.profileShift : 0,
    };
    return attempt(() => generateInvoluteGear(params));
  }, [i.mode, i.module, i.teeth, i.pressureAngle, i.bore, i.boreShape, i.flatDepth,
      i.hub, i.hubHeight, i.thickness, i.backlash, i.profileShift]);

  // Gear B (pair mode) — shares module / pressure angle / thickness / bore
  // shape / backlash; its bore is pulled in if gear A's would reach ITS root.
  const gearB = useMemo(() => {
    if (i.mode !== "pair") return NONE;
    const bore = Math.max(0, Math.min(i.bore, 2 * rootRadius(i.teethB, i.module) - 0.5));
    return attempt(() =>
      generateInvoluteGear({
        module: i.module,
        teeth: i.teethB,
        pressureAngle: i.pressureAngle,
        boreDiameter: bore,
        boreShape: i.boreShape,
        flatDepth: Math.min(i.flatDepth, bore * 0.9),
        thickness: i.thickness,
        backlash: i.backlash,
      }),
    );
  }, [i.mode, i.module, i.teethB, i.pressureAngle, i.bore, i.boreShape, i.flatDepth, i.thickness, i.backlash]);

  // Bevel pair (90° shafts) — each gear needs the OTHER's tooth count to know
  // its own pitch angle, so both calls pass matingTeeth.
  const bevelA = useMemo(() => {
    if (i.mode !== "bevel") return NONE;
    return attempt(() =>
      generateBevelGear({
        teeth: i.teeth, matingTeeth: i.teethB, module: i.module, pressureAngle: i.pressureAngle,
        faceWidth: i.faceWidth, boreDiameter: i.bevelBore, boreShape: i.boreShape,
        flatDepth: Math.min(i.flatDepth, i.bevelBore * 0.9), backlash: i.backlash,
      }),
    );
  }, [i.mode, i.teeth, i.teethB, i.module, i.pressureAngle, i.faceWidth, i.bevelBore,
      i.boreShape, i.flatDepth, i.backlash]);

  const bevelB = useMemo(() => {
    if (i.mode !== "bevel") return NONE;
    return attempt(() =>
      generateBevelGear({
        teeth: i.teethB, matingTeeth: i.teeth, module: i.module, pressureAngle: i.pressureAngle,
        faceWidth: i.faceWidth, boreDiameter: i.bevelBore, boreShape: i.boreShape,
        flatDepth: Math.min(i.flatDepth, i.bevelBore * 0.9), backlash: i.backlash,
      }),
    );
  }, [i.mode, i.teeth, i.teethB, i.module, i.pressureAngle, i.faceWidth, i.bevelBore,
      i.boreShape, i.flatDepth, i.backlash]);

  // Matching shaft, shown seated in the bore so the fit is visible before
  // printing rather than just trusted from the numbers.
  const shaft = useMemo(() => {
    if (i.mode !== "single" || i.bore <= 0 || !i.showShaft) return NONE;
    return attempt(() =>
      generateShaft({
        boreDiameter: i.bore, boreShape: i.boreShape, flatDepth: i.flatDepth,
        length: i.shaftLength, clearance: i.shaftClearance,
      }),
    );
  }, [i.mode, i.bore, i.boreShape, i.flatDepth, i.shaftLength, i.shaftClearance, i.showShaft]);

  return {
    gear: gear.geo,
    gearB: gearB.geo,
    bevelA: bevelA.geo,
    bevelB: bevelB.geo,
    shaft: shaft.geo,
    error: i.mode === "bevel" ? bevelA.error || bevelB.error : gear.error || gearB.error,
  };
}
