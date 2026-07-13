/**
 * Bird's-eye 3D gear preview. The renderer/scene/camera/controls are built
 * once and reused; only the mesh geometry is swapped when it changes (no
 * per-tick teardown). Idle: the gear auto-spins in-plane. Drag to orbit,
 * scroll/pinch to zoom — grabbing it stops the idle spin so you can inspect.
 *
 * Optional `shaft` geometry renders seated in the bore, world-fixed (it does
 * NOT spin with the gear) so you can see the shaft poking through and confirm
 * the fit visually before printing — like a stationary axle the gear turns on.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { attachHorizontalWheelPan } from "./orbitPan.js";

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  gearGroup: THREE.Group; // spins
  mat: THREE.MeshStandardMaterial;
  shaftMat: THREE.MeshStandardMaterial;
  mesh: THREE.Mesh | null;
  shaftMesh: THREE.Mesh | null; // world-fixed, does not spin
  spin: boolean;
  raf: number;
}

/** Translate so the geometry is centred on Z only — x/y stay at their native
 *  origin (both the gear's bore and the shaft profile are built around (0,0),
 *  so leaving x/y untouched keeps the shaft exactly seated in the bore). */
function centerZ(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  geometry.translate(0, 0, -(b.max.z + b.min.z) / 2);
  return geometry;
}

function displayGeom(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g0 = source.clone();
  centerZ(g0);
  const g = toCreasedNormals(g0, THREE.MathUtils.degToRad(30));
  g0.dispose();
  return g;
}

interface Props {
  geometry: THREE.BufferGeometry | null;
  shaft?: THREE.BufferGeometry | null;
}

export default function GearPreview({ geometry, shaft = null }: Props) {
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
    controls.enablePan = true; // right-drag pans; also enables real two-finger touch-drag pan
    controls.rotateSpeed = 0.9;

    const gearGroup = new THREE.Group();
    scene.add(gearGroup);

    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8a95a1, metalness: 0.45, roughness: 0.35 });
    const c: Ctx = {
      renderer, scene, camera, controls, gearGroup, mat, shaftMat,
      mesh: null, shaftMesh: null, spin: true, raf: 0,
    };
    ctx.current = c;
    controls.addEventListener("start", () => { c.spin = false; });
    const detachWheelPan = attachHorizontalWheelPan(renderer.domElement, camera, controls, () => { c.spin = false; });

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
      if (c.spin) c.gearGroup.rotation.z += 0.01; // shaft is NOT in gearGroup -> stays fixed
      controls.update();
      renderer.render(scene, camera);
      c.raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(c.raf);
      ro.disconnect();
      detachWheelPan();
      controls.dispose();
      c.mesh?.geometry.dispose();
      c.shaftMesh?.geometry.dispose();
      mat.dispose();
      shaftMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  // ---- swap gear geometry in place ----
  useEffect(() => {
    const c = ctx.current;
    if (!c || !geometry) return;
    if (c.mesh) {
      c.gearGroup.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
    const g = displayGeom(geometry);
    const mesh = new THREE.Mesh(g, c.mat);
    c.gearGroup.add(mesh);
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

  // ---- swap shaft geometry in place (world-fixed, not part of gearGroup) ----
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (c.shaftMesh) {
      c.scene.remove(c.shaftMesh);
      c.shaftMesh.geometry.dispose();
      c.shaftMesh = null;
    }
    if (!shaft) return;
    const g = displayGeom(shaft);
    const mesh = new THREE.Mesh(g, c.shaftMat);
    c.scene.add(mesh);
    c.shaftMesh = mesh;
  }, [shaft]);

  return <div className="preview" ref={host} />;
}
