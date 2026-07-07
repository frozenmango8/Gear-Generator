/**
 * Browser GUI for the general-purpose involute gear generator (React form).
 * Single-gear mode: free module/teeth/pressure-angle/bore/hub/thickness with
 * STL download. Meshing-pair mode: two same-module gears shown interlocked at
 * true relative size, to confirm they mesh regardless of tooth count.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { rootRadius, outerRadius, DEFAULT_PRESSURE_ANGLE, MIN_TEETH } from "./common.js";
import { generateInvoluteGear, GearParams, GearValidationError, BoreShape } from "./gears.js";
import { downloadStl } from "./stl.js";
import GearPreview from "./GearPreview.js";
import MeshPreview from "./MeshPreview.js";

type Mode = "single" | "pair";

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
  const [thickness, setThickness] = useState(6);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);

  // dynamic limits so sliders can't cross into invalid geometry
  const maxBore = Math.max(0, +(2 * rootRadius(teeth, module) - 0.2).toFixed(1));
  const maxHub = +(2 * outerRadius(teeth, module) - 0.4).toFixed(1);
  const maxFlat = Math.max(0.2, +(bore * 0.9).toFixed(1));

  useEffect(() => {
    if (bore > maxBore) setBore(maxBore);
    if (hub !== 0 && hub > maxHub) setHub(maxHub);
    if (flatDepth > maxFlat) setFlatDepth(maxFlat);
  }, [maxBore, maxHub, maxFlat]); // eslint-disable-line react-hooks/exhaustive-deps

  const params: GearParams = {
    module, teeth, pressureAngle, boreDiameter: bore, boreShape, flatDepth,
    hubDiameter: mode === "single" ? hub : 0, thickness,
  };

  // gear A
  useEffect(() => {
    try {
      setGeometry(generateInvoluteGear(params));
      setError("");
    } catch (e) {
      setGeometry(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [module, teeth, pressureAngle, bore, boreShape, flatDepth, hub, thickness, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // gear B (pair mode) — shares module / pressure angle / thickness / bore shape
  useEffect(() => {
    if (mode !== "pair") return;
    try {
      const boreB = Math.max(0, Math.min(bore, 2 * rootRadius(teethB, module) - 0.5));
      const flatB = Math.min(flatDepth, boreB * 0.9);
      setGeometryB(generateInvoluteGear({ module, teeth: teethB, pressureAngle, boreDiameter: boreB, boreShape, flatDepth: flatB, thickness }));
    } catch {
      setGeometryB(null);
    }
  }, [mode, module, teethB, pressureAngle, bore, boreShape, flatDepth, thickness]);

  const download = (t: number, geo: THREE.BufferGeometry | null) => {
    if (!geo) return;
    try {
      const suffix = bore > 0 && boreShape === "d_flat" ? "_dflat" : "";
      downloadStl(geo, `gear_m${module}_${t}t${suffix}.stl`);
      setStatus(`Downloaded ${t}t gear, module ${module} (${(module * t).toFixed(1)} mm pitch dia).`);
      setError("");
    } catch (e) {
      setError(e instanceof GearValidationError ? e.message : String(e));
    }
  };

  const centreDist = ((module * (teeth + teethB)) / 2).toFixed(1);

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
            <MeshPreview gearA={geometry} gearB={geometryB} teethA={teeth} teethB={teethB} module={module} />
          ) : (
            <GearPreview geometry={geometry} />
          )}
          <div className="readout">
            {mode === "pair" ? (
              <>
                <span>ratio <b>{teeth}:{teethB}</b></span>
                <span>centres <b>{centreDist}</b> mm apart</span>
                <span>module <b>{module.toFixed(1)}</b> (shared → they mesh)</span>
              </>
            ) : (
              <>
                <span>pitch &oslash; <b>{(module * teeth).toFixed(1)}</b> mm</span>
                <span>outer &oslash; <b>{(2 * outerRadius(teeth, module)).toFixed(1)}</b> mm</span>
              </>
            )}
          </div>
        </section>

        <section className="panel controls">
          <div className="seg" role="group" aria-label="Mode">
            {(["single", "pair"] as Mode[]).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === "single" ? "Single gear" : "Meshing pair"}
              </button>
            ))}
          </div>

          <div className="field">
            <div className="field-head"><span>Module</span><span className="val">{module.toFixed(1)} mm</span></div>
            <input type="range" min={0.5} max={5} step={0.1} value={module}
              onChange={(e) => setModule(Number(e.target.value))} />
            <small>tooth size — {mode === "pair" ? "shared by both gears" : "mm per tooth on the pitch circle"}</small>
          </div>

          <div className="field">
            <div className="field-head"><span>{mode === "pair" ? "Gear A teeth" : "Teeth"}</span><span className="val">{teeth}</span></div>
            <input type="range" min={MIN_TEETH} max={60} step={1} value={teeth}
              onChange={(e) => setTeeth(Number(e.target.value))} />
            <small>any integer ≥ {MIN_TEETH}</small>
          </div>

          {mode === "pair" && (
            <div className="field">
              <div className="field-head"><span>Gear B teeth</span><span className="val">{teethB}</span></div>
              <input type="range" min={MIN_TEETH} max={60} step={1} value={teethB}
                onChange={(e) => setTeethB(Number(e.target.value))} />
              <small>different count, same module → still meshes</small>
            </div>
          )}

          <fieldset className="field">
            <span>Pressure angle</span>
            <div className="seg">
              {[20, 14.5].map((a) => (
                <button key={a} type="button" aria-pressed={pressureAngle === a}
                  onClick={() => setPressureAngle(a)}>{a}&deg;{a === 20 ? " (std)" : " (legacy)"}</button>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <div className="field-head"><span>Bore diameter</span><span className="val">{bore.toFixed(1)} mm</span></div>
            <input type="range" min={0} max={maxBore} step={0.5} value={Math.min(bore, maxBore)}
              onChange={(e) => setBore(Number(e.target.value))} />
            <small>hole diameter (0 = solid centre)</small>
          </div>

          {bore > 0 && (
            <fieldset className="field">
              <span>Bore shape</span>
              <div className="seg">
                {(["round", "d_flat"] as BoreShape[]).map((s) => (
                  <button key={s} type="button" aria-pressed={boreShape === s}
                    onClick={() => setBoreShape(s)}>
                    {s === "round" ? "Round" : "D-flat (D-shaft)"}
                  </button>
                ))}
              </div>
              <small>D-flat matches a flatted motor shaft so the gear can't spin free</small>
            </fieldset>
          )}

          {bore > 0 && boreShape === "d_flat" && (
            <div className="field">
              <div className="field-head"><span>Flat depth</span><span className="val">{flatDepth.toFixed(1)} mm</span></div>
              <input type="range" min={0.2} max={maxFlat} step={0.1} value={Math.min(flatDepth, maxFlat)}
                onChange={(e) => setFlatDepth(Number(e.target.value))} />
              <small>how much the flat cuts into the round bore</small>
            </div>
          )}

          {mode === "single" && (
            <div className="field">
              <div className="field-head"><span>Hub diameter</span><span className="val">{hub === 0 ? "none" : `${hub.toFixed(1)} mm`}</span></div>
              <input type="range" min={0} max={maxHub} step={0.5} value={hub}
                onChange={(e) => { const v = Number(e.target.value); setHub(v <= bore ? 0 : v); }} />
              <small>0 = none; a boss around the bore, as tall as the gear</small>
            </div>
          )}

          <div className="field">
            <div className="field-head"><span>Thickness</span><span className="val">{thickness.toFixed(1)} mm</span></div>
            <input type="range" min={1} max={20} step={0.5} value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))} />
          </div>

          {mode === "pair" ? (
            <div className="btn-row">
              <button className="primary" onClick={() => download(teeth, geometry)} disabled={!geometry}>
                Download gear A ({teeth}t)
              </button>
              <button className="primary" onClick={() => download(teethB, geometryB)} disabled={!geometryB}>
                Download gear B ({teethB}t)
              </button>
            </div>
          ) : (
            <button className="primary" onClick={() => download(teeth, geometry)} disabled={!geometry}>
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
