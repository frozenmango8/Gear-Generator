/**
 * Browser GUI for the general-purpose involute gear generator (React form).
 * Free parameters: module, teeth, pressure angle, bore, hub, thickness.
 * Downloads a binary STL via a browser Blob — fully client-side, no server.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { rootRadius, outerRadius, DEFAULT_PRESSURE_ANGLE, MIN_TEETH } from "./common.js";
import { generateInvoluteGear, GearParams, GearValidationError } from "./gears.js";
import { downloadStl } from "./stl.js";
import GearPreview from "./GearPreview.js";

export default function App() {
  const [module, setModule] = useState(2);
  const [teeth, setTeeth] = useState(20);
  const [pressureAngle, setPressureAngle] = useState(DEFAULT_PRESSURE_ANGLE);
  const [bore, setBore] = useState(6);
  const [hub, setHub] = useState(0);
  const [thickness, setThickness] = useState(6);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  // dynamic limits so sliders can't cross into invalid geometry
  const maxBore = Math.max(0, +(2 * rootRadius(teeth, module) - 0.2).toFixed(1));
  const maxHub = +(2 * outerRadius(teeth, module) - 0.4).toFixed(1);

  // clamp dependent values when module/teeth change
  useEffect(() => {
    if (bore > maxBore) setBore(maxBore);
    if (hub !== 0 && hub > maxHub) setHub(maxHub);
  }, [maxBore, maxHub]); // eslint-disable-line react-hooks/exhaustive-deps

  const params: GearParams = { module, teeth, pressureAngle, boreDiameter: bore, hubDiameter: hub, thickness };

  useEffect(() => {
    try {
      setGeometry(generateInvoluteGear(params));
      setError("");
    } catch (e) {
      setGeometry(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [module, teeth, pressureAngle, bore, hub, thickness]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDownload = () => {
    try {
      const geo = generateInvoluteGear(params);
      const name = `gear_m${module}_${teeth}t${hub ? "_hub" : ""}.stl`;
      downloadStl(geo, name);
      setStatus(`Downloaded ${teeth}t gear, module ${module} (${(module * teeth).toFixed(1)} mm pitch dia).`);
      setError("");
    } catch (e) {
      setError(e instanceof GearValidationError ? e.message : String(e));
    }
  };

  const pitchDia = (module * teeth).toFixed(1);
  const outerDia = (2 * outerRadius(teeth, module)).toFixed(1);

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
          <GearPreview geometry={geometry} />
          <div className="readout">
            <span>pitch &oslash; <b>{pitchDia}</b> mm</span>
            <span>outer &oslash; <b>{outerDia}</b> mm</span>
          </div>
        </section>

        <section className="panel controls">
          <div className="field">
            <div className="field-head"><span>Module</span><span className="val">{module.toFixed(1)} mm</span></div>
            <input type="range" min={0.5} max={5} step={0.1} value={module}
              onChange={(e) => setModule(Number(e.target.value))} />
            <small>tooth size (mm per tooth on the pitch circle)</small>
          </div>

          <div className="field">
            <div className="field-head"><span>Teeth</span><span className="val">{teeth}</span></div>
            <input type="range" min={MIN_TEETH} max={60} step={1} value={teeth}
              onChange={(e) => setTeeth(Number(e.target.value))} />
            <small>any integer ≥ {MIN_TEETH}</small>
          </div>

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
            <small>round hole (0 = solid centre)</small>
          </div>

          <div className="field">
            <div className="field-head"><span>Hub diameter</span><span className="val">{hub === 0 ? "none" : `${hub.toFixed(1)} mm`}</span></div>
            <input type="range" min={0} max={maxHub} step={0.5} value={hub}
              onChange={(e) => { const v = Number(e.target.value); setHub(v <= bore ? 0 : v); }} />
            <small>0 = none; a boss around the bore, as tall as the gear</small>
          </div>

          <div className="field">
            <div className="field-head"><span>Thickness</span><span className="val">{thickness.toFixed(1)} mm</span></div>
            <input type="range" min={1} max={20} step={0.5} value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))} />
          </div>

          <button className="primary" onClick={onDownload} disabled={!geometry}>
            Download gear STL
          </button>
          {error && <p className="msg error">{error}</p>}
          {!error && status && <p className="msg ok">{status}</p>}
        </section>
      </div>
    </div>
  );
}
