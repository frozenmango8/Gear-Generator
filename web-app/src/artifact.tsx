/**
 * Self-contained artifact entry: the GEAR generator only (no fit-gauge / no
 * manifold WASM), so the whole thing inlines into one HTML file with no
 * network requests — required by the artifact CSP. Imports only gears/common/
 * stl, none of which pull in manifold-3d.
 */

import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { SUPPORTED_TEETH, BoreType, outerRadius } from "./common.js";
import { generateLegoGear, GearValidationError } from "./gears.js";
import { downloadStl } from "./stl.js";
import "./style.css";

const BORES: { value: BoreType; label: string }[] = [
  { value: "cross_axle", label: "Cross axle (+ shaped)" },
  { value: "pin_hole", label: "Pin hole (round)" },
];

function GearPreview({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !geometry) return;
    const w = host.clientWidth || 360;
    const h = host.clientHeight || 360;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const g = geometry.clone();
    g.center();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.rotation.x = 0; // bird's-eye: gear face straight toward the camera
    scene.add(mesh);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 8);
    scene.add(key);
    g.computeBoundingSphere();
    camera.position.set(0, 0, (g.boundingSphere?.radius ?? 20) * 3.2);

    let raf = 0;
    const loop = () => {
      mesh.rotation.z += 0.01;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      g.dispose();
      mat.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [geometry]);
  return <div className="preview" ref={ref} />;
}

function App() {
  const [teeth, setTeeth] = useState(24);
  const [thickness, setThickness] = useState(1);
  const [bore, setBore] = useState<BoreType>("cross_axle");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    try {
      setGeometry(generateLegoGear({ teeth, thicknessUnits: thickness, boreType: bore }));
      setError("");
    } catch (e) {
      setGeometry(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [teeth, thickness, bore]);

  const onDownload = () => {
    try {
      const geo = generateLegoGear({ teeth, thicknessUnits: thickness, boreType: bore });
      downloadStl(geo, `lego_gear_${teeth}t_${bore}.stl`);
      setStatus(`Downloaded ${teeth}t gear (${(thickness * 3.2).toFixed(1)} mm thick).`);
    } catch (e) {
      setError(e instanceof GearValidationError ? e.message : String(e));
    }
  };

  const od = (outerRadius(teeth) * 2).toFixed(0);

  return (
    <div className="wrap">
      <header>
        <div className="eyebrow">LEGO Gear Generator</div>
        <h1>Print a gear that meshes with LEGO</h1>
        <p className="sub">
          Module-1 involute gears with a real cross-axle bore — the verified
          geometry from the Python tool, generated live in your browser.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <GearPreview geometry={geometry} />
        </section>
        <section className="panel controls">
          <div className="field">
            <div className="field-head"><span>Teeth</span><span className="val">{teeth}</span></div>
            <input
              type="range"
              min={0}
              max={SUPPORTED_TEETH.length - 1}
              step={1}
              value={(SUPPORTED_TEETH as readonly number[]).indexOf(teeth)}
              onChange={(e) => setTeeth(SUPPORTED_TEETH[Number(e.target.value)])}
            />
            <small>outer &oslash; {od} mm &middot; standard LEGO sizes</small>
          </div>

          <div className="field">
            <div className="field-head">
              <span>Thickness</span>
              <span className="val">{(thickness * 3.2).toFixed(1)} mm</span>
            </div>
            <input type="range" min={1} max={10} step={1} value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))} />
            <small>{thickness} plate unit{thickness > 1 ? "s" : ""}</small>
          </div>

          <fieldset className="field">
            <span>Bore type</span>
            {BORES.map((b) => (
              <label key={b.value} className="radio">
                <input type="radio" name="bore" checked={bore === b.value}
                  onChange={() => setBore(b.value)} />
                {b.label}
              </label>
            ))}
          </fieldset>

          <button className="primary" onClick={onDownload} disabled={!geometry}>
            Download gear STL
          </button>
          {error && <p className="msg error">{error}</p>}
          {!error && status && <p className="msg ok">{status}</p>}
          <p className="note">
            Drag-free auto-spin preview. Fit-gauge tools are in the full app
            (they need a WASM boolean engine that can’t load in this sandbox).
          </p>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
