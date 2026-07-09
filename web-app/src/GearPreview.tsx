/**
 * Bird's-eye 3D gear preview. The renderer/scene/camera/controls are built
 * once and reused; only the mesh geometry is swapped when it changes (no
 * per-tick teardown). Idle: the gear auto-spins in-plane. Drag to orbit,
 * scroll/pinch to zoom — grabbing it stops the idle spin so you can inspect.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mat: THREE.MeshStandardMaterial;
  mesh: THREE.Mesh | null;
  spin: boolean;
  raf: number;
}

export default function GearPreview({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Ctx | null>(null);

  // ---- build once ----
  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    camera.position.set(0, 0, 60);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 8);
    scene.add(key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = false;
    controls.rotateSpeed = 0.9;

    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const c: Ctx = { renderer, scene, camera, controls, mat, mesh: null, spin: true, raf: 0 };
    ctx.current = c;
    controls.addEventListener("start", () => { c.spin = false; });

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const loop = () => {
      if (c.spin && c.mesh) c.mesh.rotation.z += 0.01;
      controls.update();
      renderer.render(scene, camera);
      c.raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(c.raf);
      ro.disconnect();
      controls.dispose();
      c.mesh?.geometry.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  // ---- swap geometry in place ----
  useEffect(() => {
    const c = ctx.current;
    if (!c || !geometry) return;
    if (c.mesh) {
      c.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
    const g0 = geometry.clone();
    g0.center();
    const g = toCreasedNormals(g0, THREE.MathUtils.degToRad(30));
    g0.dispose();
    const mesh = new THREE.Mesh(g, c.mat);
    c.scene.add(mesh);
    c.mesh = mesh;

    g.computeBoundingSphere();
    const r = g.boundingSphere?.radius ?? 20;
    c.controls.minDistance = r * 1.1;
    c.controls.maxDistance = r * 10;
    if (c.spin) {
      // not yet grabbed: keep the framed bird's-eye view as the gear resizes
      c.camera.position.set(0, 0, r * 3.0);
      c.controls.target.set(0, 0, 0);
      c.controls.update();
    }
  }, [geometry]);

  return <div className="preview" ref={host} />;
}
