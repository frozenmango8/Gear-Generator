/**
 * Browser GUI for the general-purpose involute gear generator (React form).
 * Single-gear mode: free module/teeth/pressure-angle/bore/hub/thickness with
 * STL download. Meshing-pair mode: two same-module gears shown interlocked at
 * true relative size, to confirm they mesh regardless of tooth count. Bevel
 * mode: a straight-bevel pair whose shafts meet at 90°.
 *
 * State here is only what the user typed. Everything downstream — the slider
 * limits, the effective (clamped) parameter values, and the geometry itself —
 * is derived during render, so there are no effects syncing state to state.
 */

import { useState } from "react";
import * as THREE from "three";
import { rootRadius, outerRadius, minProfileShift, hasUndercut, DEFAULT_PRESSURE_ANGLE, MIN_TEETH, MAX_PROFILE_SHIFT } from "./common.js";
import { gearParamsFromPreset, GearValidationError, BoreShape } from "./gears.js";
import { generateShaft, ShaftError } from "./shaft.js";
import { bevelPitchAngle, bevelOuterConeDistance, bevelMaxBoreDiameter, BevelGearValidationError } from "./bevel.js";
import { useDesignGeometry, Mode } from "./useDesignGeometry.js";
import { downloadStl } from "./stl.js";
import GearPreview from "./GearPreview.js";
import MeshPreview from "./MeshPreview.js";
import BevelPreview from "./BevelPreview.js";
import Slider from "./ui/Slider.js";
import Segmented from "./ui/Segmented.js";
import presetM1 from "./presets/m1-20t-5mm.json";
import presetM15Hub from "./presets/m1.5-30t-6mm-hub.json";
import presetM2 from "./presets/m2-12t-8mm.json";

const PRESETS: Record<string, unknown>[] = [presetM1, presetM15Hub, presetM2];

export default function App() {
  const [mode, setMode] = useState<Mode>("single");
  const [module, setModule] = useState(2);
  const [teeth, setTeeth] = useState(20);
  const [teethB, setTeethB] = useState(12);
  const [pressureAngle, setPressureAngle] = useState(DEFAULT_PRESSURE_ANGLE);
  const [bore, setBore] = useState(6);
  const [boreShape, setBoreShape] = useState<BoreShape>("round");
  const [flatDepth, setFlatDepth] = useState(1.5);
  const [hub, setHub] = useState(0);
  const [hubHeight, setHubHeight] = useState(6);
  const [thickness, setThickness] = useState(6);
  const [backlash, setBacklash] = useState(0.1);
  const [profileShift, setProfileShift] = useState(0);
  const [shaftLength, setShaftLength] = useState(30);
  const [shaftClearance, setShaftClearance] = useState(0.2);
  const [showShaftInPreview, setShowShaftInPreview] = useState(true);
  const [faceWidth, setFaceWidth] = useState(5);
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");

  // ---- limits, so a slider can't reach invalid geometry ----
  const maxBore = Math.max(0, +(2 * rootRadius(teeth, module, profileShift) - 0.2).toFixed(1));
  const maxHub = +(2 * outerRadius(teeth, module, profileShift) - 0.4).toFixed(1);
  const maxBacklash = +Math.min(0.6, module * 0.4).toFixed(2);

  // bevel-pair geometry (90° shaft angle): pitch angles, shared outer cone
  // distance, and a face-width bound (must stay under Ro so the small/toe
  // end keeps a positive radius)
  const bevelRo = bevelOuterConeDistance(teeth, teethB, module);
  const gammaA = bevelPitchAngle(teeth, teethB);
  const gammaB = bevelPitchAngle(teethB, teeth);
  const maxFaceWidth = +(bevelRo * 0.85).toFixed(1);

  // ---- effective values: what the geometry, the sliders and the readouts all
  // use. Clamping on read (rather than an effect writing the limit back into
  // state) keeps the three in step by construction, and means widening a limit
  // again — more teeth, a bigger module — restores the value the user asked
  // for instead of leaving it stuck at some earlier ceiling.
  const backlashV = Math.min(backlash, maxBacklash);
  const faceWidthV = Math.min(faceWidth, maxFaceWidth);
  const boreV = Math.min(bore, maxBore);
  const hubV = hub === 0 ? 0 : Math.min(hub, maxHub);
  // Both gears' limits, less the same 0.2 mm margin the spur `maxBore` above
  // keeps. Landing exactly ON a limit is rejected (validation is `>=`), so a
  // bore clamped to the bare minimum of the two used to make whichever gear
  // owns that tighter limit throw — its download button went dead while the
  // other stayed live.
  const maxBevelBore = Math.max(0, +(Math.min(
    bevelMaxBoreDiameter(teeth, teethB, module, pressureAngle, faceWidthV, backlashV),
    bevelMaxBoreDiameter(teethB, teeth, module, pressureAngle, faceWidthV, backlashV),
  ) - 0.2).toFixed(1));
  const bevelBoreV = Math.max(0, Math.min(bore, maxBevelBore));
  const boreShown = mode === "bevel" ? bevelBoreV : boreV;
  const maxFlat = Math.max(0.2, +(boreShown * 0.9).toFixed(1));
  const flatDepthV = Math.min(flatDepth, maxFlat);

  const recommendedShift = +minProfileShift(teeth, pressureAngle).toFixed(2);
  const undercut = hasUndercut(teeth, pressureAngle, profileShift);
  const centreDist = ((module * (teeth + teethB)) / 2).toFixed(1);

  const { gear, gearB, bevelA, bevelB, shaft, error: geometryError } = useDesignGeometry({
    mode, module, teeth, teethB, pressureAngle,
    bore: boreV, bevelBore: bevelBoreV, boreShape, flatDepth: flatDepthV,
    hub: hubV, hubHeight, thickness, backlash: backlashV, profileShift,
    faceWidth: faceWidthV, shaftLength, shaftClearance, showShaft: showShaftInPreview,
  });
  const error = geometryError || actionError;

  const succeeded = (msg: string) => {
    setStatus(msg);
    setActionError("");
  };

  const download = (t: number, geo: THREE.BufferGeometry | null) => {
    if (!geo) return;
    try {
      const suffix = boreShown > 0 && boreShape === "d_flat" ? "_dflat" : "";
      downloadStl(geo, `gear_m${module}_${t}t${suffix}.stl`);
      succeeded(`Downloaded ${t}t gear, module ${module} (${(module * t).toFixed(1)} mm pitch dia).`);
    } catch (e) {
      setActionError(e instanceof GearValidationError ? e.message : String(e));
    }
  };

  const downloadBevel = (t: number, mate: number, geo: THREE.BufferGeometry | null) => {
    if (!geo) return;
    try {
      const suffix = boreShown > 0 && boreShape === "d_flat" ? "_dflat" : "";
      downloadStl(geo, `bevel_m${module}_${t}t_mate${mate}t${suffix}.stl`);
      succeeded(`Downloaded ${t}t bevel gear (mates with ${mate}t at 90°, module ${module}).`);
    } catch (e) {
      setActionError(e instanceof BevelGearValidationError ? e.message : String(e));
    }
  };

  const downloadShaft = () => {
    try {
      const geo = generateShaft({ boreDiameter: boreV, boreShape, flatDepth: flatDepthV, length: shaftLength, clearance: shaftClearance });
      const suffix = boreShape === "d_flat" ? "_dflat" : "";
      downloadStl(geo, `shaft_d${boreV}${suffix}_L${shaftLength}.stl`);
      succeeded(`Downloaded shaft: ⌀${(boreV - 2 * shaftClearance).toFixed(1)} mm × ${shaftLength} mm (${shaftClearance.toFixed(2)} mm clearance).`);
    } catch (e) {
      setActionError(e instanceof ShaftError ? e.message : String(e));
    }
  };

  const applyPreset = (rec: Record<string, unknown>) => {
    const p = gearParamsFromPreset(rec);
    setModule(p.module);
    setTeeth(p.teeth);
    setPressureAngle(p.pressureAngle ?? DEFAULT_PRESSURE_ANGLE);
    setBore(p.boreDiameter ?? 0);
    setBoreShape(p.boreShape ?? "round");
    setFlatDepth(p.flatDepth ?? 1.5);
    setHub(p.hubDiameter ?? 0);
    setHubHeight(p.hubHeight ?? p.thickness);
    setThickness(p.thickness);
    setBacklash(p.backlash ?? 0);
    setProfileShift(p.profileShift ?? 0);
    setMode("single");
    succeeded(`Loaded preset: ${rec.name as string}`);
  };

  /** Turning the hub on seeds its height from the current thickness. */
  const changeHub = (v: number) => {
    const on = v > boreV;
    if (on && hubV === 0) setHubHeight(thickness);
    setHub(on ? v : 0);
  };

  return (
    <div className="wrap">
      <header>
        <div className="eyebrow">Involute Gear Generator</div>
        <h1>Design a spur gear, export an STL</h1>
        <p className="sub">
          Parametric involute spur gears — set the module, teeth, and bore
          freely. Generated live in your browser, no server.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          {mode === "pair" ? (
            <MeshPreview gearA={gear} gearB={gearB} teethA={teeth} teethB={teethB} module={module} />
          ) : mode === "bevel" ? (
            <BevelPreview gearA={bevelA} gearB={bevelB} teethA={teeth} teethB={teethB} module={module} faceWidth={faceWidthV} />
          ) : (
            <GearPreview geometry={gear} shaft={shaft} />
          )}
          <div className="readout">
            {mode === "pair" ? (
              <>
                <span>ratio <b>{teeth}:{teethB}</b></span>
                <span>centres <b>{centreDist}</b> mm apart</span>
                <span>module <b>{module.toFixed(1)}</b> (shared → they mesh)</span>
              </>
            ) : mode === "bevel" ? (
              <>
                <span>pitch angles <b>{THREE.MathUtils.radToDeg(gammaA).toFixed(1)}&deg; + {THREE.MathUtils.radToDeg(gammaB).toFixed(1)}&deg;</b> = 90&deg;</span>
                <span>outer cone dist <b>{bevelRo.toFixed(1)}</b> mm (shared apex)</span>
                <span>face width <b>{faceWidthV.toFixed(1)}</b> mm</span>
              </>
            ) : (
              <>
                <span>pitch &oslash; <b>{(module * teeth).toFixed(1)}</b> mm</span>
                <span>outer &oslash; <b>{(2 * outerRadius(teeth, module, profileShift)).toFixed(1)}</b> mm</span>
                {shaft && <span>shaft <b>⌀{(boreV - 2 * shaftClearance).toFixed(1)}</b> seated in bore</span>}
                {undercut && <span className="warn">undercut — thin at the base</span>}
              </>
            )}
          </div>
        </section>

        <section className="panel controls">
          <Segmented<Mode>
            ariaLabel="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "single", label: "Single gear" },
              { value: "pair", label: "Meshing pair" },
              { value: "bevel", label: "Bevel pair (90°)" },
            ]}
          />

          <div className="field">
            <div className="field-head"><span>Presets</span></div>
            <select
              value=""
              onChange={(e) => {
                const i = Number(e.target.value);
                if (PRESETS[i]) applyPreset(PRESETS[i]);
              }}
            >
              <option value="" disabled>Load a preset…</option>
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.name as string}</option>
              ))}
            </select>
            <small>fills in every field below at once; tweak freely after</small>
          </div>

          <Slider
            label="Module"
            display={`${module.toFixed(1)} mm`}
            value={module} min={0.5} max={5} step={0.1} onChange={setModule}
            help={`tooth size — ${mode !== "single" ? "shared by both gears" : "mm per tooth on the pitch circle"}`}
          />

          <Slider
            label={mode !== "single" ? "Gear A teeth" : "Teeth"}
            display={teeth}
            value={teeth} min={MIN_TEETH} max={60} step={1} onChange={setTeeth}
            help={`any integer ≥ ${MIN_TEETH}`}
          />

          {(mode === "pair" || mode === "bevel") && (
            <Slider
              label="Gear B teeth"
              display={teethB}
              value={teethB} min={MIN_TEETH} max={60} step={1} onChange={setTeethB}
              help={mode === "bevel"
                ? "sets both gears' pitch angle (they always sum to 90°)"
                : "different count, same module → still meshes"}
            />
          )}

          {mode === "bevel" && (
            <Slider
              label="Face width"
              display={`${faceWidthV.toFixed(1)} mm`}
              value={faceWidthV} min={1} max={maxFaceWidth} step={0.5} onChange={setFaceWidth}
              help="axial depth of the tooth band, out from the shared apex"
            />
          )}

          {mode === "single" && (
            <Slider
              label="Profile shift"
              display={profileShift === 0 ? "none" : profileShift.toFixed(2)}
              value={profileShift} min={0} max={MAX_PROFILE_SHIFT} step={0.02} onChange={setProfileShift}
              warn={undercut}
              help={undercut ? (
                <>
                  {teeth}t undercuts below shift {recommendedShift.toFixed(2)} — thin, weak tooth base.{" "}
                  <button type="button" className="linklike" onClick={() => setProfileShift(recommendedShift)}>
                    Auto-fix undercut
                  </button>
                </>
              ) : (
                `thickens the tooth base for low tooth counts; ${teeth}t needs none at this pressure angle`
              )}
            />
          )}

          <Segmented
            label="Pressure angle"
            value={pressureAngle}
            onChange={setPressureAngle}
            options={[
              { value: 20, label: <>20&deg; (std)</> },
              { value: 14.5, label: <>14.5&deg; (legacy)</> },
            ]}
          />

          <Slider
            label="Bore diameter"
            display={`${boreShown.toFixed(1)} mm`}
            value={boreShown} min={0} max={mode === "bevel" ? maxBevelBore : maxBore} step={0.5}
            onChange={setBore}
            help="hole diameter (0 = solid centre)"
          />

          {boreShown > 0 && (
            <Segmented<BoreShape>
              label="Bore shape"
              value={boreShape}
              onChange={setBoreShape}
              options={[
                { value: "round", label: "Round" },
                { value: "d_flat", label: "D-flat (D-shaft)" },
              ]}
              help="D-flat matches a flatted motor shaft so the gear can't spin free"
            />
          )}

          {boreShown > 0 && boreShape === "d_flat" && (
            <Slider
              label="Flat depth"
              display={`${flatDepthV.toFixed(1)} mm`}
              value={flatDepthV} min={0.2} max={maxFlat} step={0.1} onChange={setFlatDepth}
              help="how much the flat cuts into the round bore"
            />
          )}

          {mode === "single" && (
            <Slider
              label="Hub diameter"
              display={hubV === 0 ? "none" : `${hubV.toFixed(1)} mm`}
              value={hubV} min={0} max={maxHub} step={0.5} onChange={changeHub}
              help="0 = none; a boss around the bore"
            />
          )}

          {mode === "single" && hubV > 0 && (
            <Slider
              label="Hub height"
              display={`${hubHeight.toFixed(1)} mm`}
              value={hubHeight} min={0.5} max={40} step={0.5} onChange={setHubHeight}
              help="how far the hub protrudes above the gear face"
            />
          )}

          {mode !== "bevel" && (
            <Slider
              label="Thickness"
              display={`${thickness.toFixed(1)} mm`}
              value={thickness} min={1} max={20} step={0.5} onChange={setThickness}
            />
          )}

          <Slider
            label="Backlash"
            display={backlashV === 0 ? "none" : `${backlashV.toFixed(2)} mm`}
            value={backlashV} min={0} max={maxBacklash} step={0.02} onChange={setBacklash}
            help="thins teeth so a printed pair turns free instead of binding. ~0.1 mm suits FDM"
          />

          {mode === "single" && boreV > 0 && (
            <div className="shaft-box">
              <div className="field-head"><span>Matching shaft (pole)</span></div>
              <small className="shaft-note">
                A {boreShape === "d_flat" ? "D-flat" : "round"} shaft sized to slide into this bore
                {boreShape === "d_flat" ? " and key against rotation." : "."}
              </small>
              <Slider
                label="Length"
                display={`${shaftLength} mm`}
                value={shaftLength} min={5} max={80} step={1} onChange={setShaftLength}
              />
              <Slider
                label="Fit clearance"
                display={`${shaftClearance.toFixed(2)} mm`}
                value={shaftClearance} min={0} max={0.5} step={0.05} onChange={setShaftClearance}
                help="gap so it slides in; bigger = looser. 0.20 mm is a good FDM start."
              />
              <label className="radio">
                <input type="checkbox" checked={showShaftInPreview}
                  onChange={(e) => setShowShaftInPreview(e.target.checked)} />
                Show shaft seated in the bore (preview)
              </label>
              <button className="secondary" onClick={downloadShaft}>Download matching shaft</button>
            </div>
          )}

          {mode === "pair" ? (
            <div className="btn-row">
              <button className="primary" onClick={() => download(teeth, gear)} disabled={!gear}>
                Download gear A ({teeth}t)
              </button>
              <button className="primary" onClick={() => download(teethB, gearB)} disabled={!gearB}>
                Download gear B ({teethB}t)
              </button>
            </div>
          ) : mode === "bevel" ? (
            <div className="btn-row">
              <button className="primary" onClick={() => downloadBevel(teeth, teethB, bevelA)} disabled={!bevelA}>
                Download gear A ({teeth}t)
              </button>
              <button className="primary" onClick={() => downloadBevel(teethB, teeth, bevelB)} disabled={!bevelB}>
                Download gear B ({teethB}t)
              </button>
            </div>
          ) : (
            <button className="primary" onClick={() => download(teeth, gear)} disabled={!gear}>
              Download gear STL
            </button>
          )}
          {error && <p className="msg error">{error}</p>}
          {!error && status && <p className="msg ok">{status}</p>}
        </section>
      </div>
    </div>
  );
}
