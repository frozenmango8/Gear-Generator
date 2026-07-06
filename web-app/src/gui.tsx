/**
 * Browser GUI for the LEGO gear generator — the Tkinter app ported to React.
 * Same fields (teeth / thickness / bore type), same validation messages, but
 * downloads the STL via a browser Blob instead of a file-save dialog.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SUPPORTED_TEETH, BoreType } from "./common.js";
import { generateLegoGear, GearValidationError } from "./gears.js";
import { clearanceSweep, initManifold } from "./fitgauge.js";
import { downloadStl } from "./stl.js";

type BoreOpt = { value: BoreType; label: string };
const BORES: BoreOpt[] = [
  { value: "cross_axle", label: "Cross axle (+ shaped)" },
  { value: "pin_hole", label: "Pin hole (round)" },
];

function GearPreview({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !geometry) return;

    const w = host.clientWidth;
    const h = host.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const g = geometry.clone();
    g.center();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.1, roughness: 0.6 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.rotation.x = 0; // bird's-eye: gear face straight toward the camera
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
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
      host.removeChild(renderer.domElement);
    };
  }, [geometry]);

  return <div className="preview" ref={ref} />;
}

export default function App() {
  const [teeth, setTeeth] = useState(24);
  const [thickness, setThickness] = useState(1);
  const [bore, setBore] = useState<BoreType>("cross_axle");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [busy, setBusy] = useState(false);

  // live preview whenever inputs change and are valid
  useEffect(() => {
    try {
      const geo = generateLegoGear({ teeth, thicknessUnits: thickness, boreType: bore });
      setGeometry(geo);
      setError("");
    } catch (e) {
      setGeometry(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [teeth, thickness, bore]);

  const onDownloadGear = () => {
    try {
      const geo = generateLegoGear({ teeth, thicknessUnits: thickness, boreType: bore });
      downloadStl(geo, `lego_gear_${teeth}t_${bore}.stl`);
      setStatus(`Downloaded ${teeth}t gear (${(thickness * 3.2).toFixed(1)} mm thick).`);
      setError("");
    } catch (e) {
      setError(e instanceof GearValidationError ? e.message : String(e));
    }
  };

  const onDownloadGauges = async () => {
    setBusy(true);
    setStatus("Loading boolean engine…");
    try {
      await initManifold();
      const items = clearanceSweep(bore);
      for (const it of items) downloadStl(it.geometry, it.filename);
      setStatus(`Downloaded ${items.length} ${bore} fit gauges.`);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      <header>
        <div className="eyebrow">LEGO Gear Generator</div>
        <h1>Print a gear that meshes with LEGO</h1>
        <p className="sub">
          Module-1 involute gears — same verified geometry as the Python tool,
          running entirely in your browser. No upload, no server.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <GearPreview geometry={geometry} />
        </section>

        <section className="panel controls">
          <label className="field">
            <span>Teeth</span>
            <select value={teeth} onChange={(e) => setTeeth(Number(e.target.value))}>
              {SUPPORTED_TEETH.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Thickness (plate units)</span>
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))}
            />
            <small>{(thickness * 3.2).toFixed(1)} mm</small>
          </label>

          <fieldset className="field">
            <span>Bore type</span>
            {BORES.map((b) => (
              <label key={b.value} className="radio">
                <input
                  type="radio"
                  name="bore"
                  checked={bore === b.value}
                  onChange={() => setBore(b.value)}
                />
                {b.label}
              </label>
            ))}
          </fieldset>

          <button className="primary" onClick={onDownloadGear} disabled={!geometry}>
            Download gear STL
          </button>
          <button className="secondary" onClick={onDownloadGauges} disabled={busy}>
            {busy ? "Working…" : `Download ${bore} fit-gauge sweep`}
          </button>

          {error && <p className="msg error">{error}</p>}
          {!error && status && <p className="msg ok">{status}</p>}
        </section>
      </div>
    </div>
  );
}
