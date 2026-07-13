/**
 * Two gears meshing at true relative size and correct centre distance. The
 * renderer/scene/camera/controls are built once; the gear meshes are rebuilt
 * only when the parameters change. The gears always counter-rotate (the
 * meshing demo); drag to orbit and scroll/pinch to zoom the camera.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { outerRadius } from "./common.js";
import { attachHorizontalWheelPan } from "./orbitPan.js";

interface Props {
  gearA: THREE.BufferGeometry | null;
  gearB: THREE.BufferGeometry | null;
  teethA: number;
  teethB: number;
  module: number;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  matA: THREE.MeshStandardMaterial;
  matB: THREE.MeshStandardMaterial;
  groupA: THREE.Group;
  groupB: THREE.Group;
  pair: THREE.Group;
  meshA: THREE.Mesh | null;
  meshB: THREE.Mesh | null;
  angleA: number;
  ratio: number;
  phaseB: number;
  R: number; // framing radius of the pair
  framed: boolean; // whether the camera has been auto-framed for current pair
  interacted: boolean;
  raf: number;
}

const FOV = 40;

function display(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(0, 0, -(b.max.z + b.min.z) / 2); // coplanar in Z
  const c = toCreasedNormals(g, THREE.MathUtils.degToRad(30));
  g.dispose();
  return c;
}

export default function MeshPreview({ gearA, gearB, teethA, teethB, module }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Ctx | null>(null);

  // ---- build once ----
  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);
    camera.position.set(0, 0, 100);
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

    const groupA = new THREE.Group();
    const groupB = new THREE.Group();
    const pair = new THREE.Group();
    pair.add(groupA, groupB);
    scene.add(pair);

    const c: Ctx = {
      renderer, scene, camera, controls,
      matA: new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 }),
      matB: new THREE.MeshStandardMaterial({ color: 0x2b7a9e, metalness: 0.15, roughness: 0.55 }),
      groupA, groupB, pair, meshA: null, meshB: null,
      angleA: 0, ratio: 1, phaseB: 0, R: 40, framed: false, interacted: false, raf: 0,
    };
    ctx.current = c;
    controls.addEventListener("start", () => { c.interacted = true; });
    const detachWheelPan = attachHorizontalWheelPan(renderer.domElement, camera, controls, () => { c.interacted = true; });

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!c.interacted) frame(c);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const loop = () => {
      c.angleA += 0.008;
      c.groupA.rotation.z = c.angleA;
      c.groupB.rotation.z = -c.angleA * c.ratio + c.phaseB;
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
      c.meshA?.geometry.dispose();
      c.meshB?.geometry.dispose();
      c.matA.dispose();
      c.matB.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  // ---- rebuild the pair when parameters change ----
  useEffect(() => {
    const c = ctx.current;
    if (!c || !gearA || !gearB) return;

    if (c.meshA) { c.groupA.remove(c.meshA); c.meshA.geometry.dispose(); }
    if (c.meshB) { c.groupB.remove(c.meshB); c.meshB.geometry.dispose(); }
    c.meshA = new THREE.Mesh(display(gearA), c.matA);
    c.meshB = new THREE.Mesh(display(gearB), c.matB);
    c.groupA.add(c.meshA);
    c.groupB.add(c.meshB);

    const D = (module * (teethA + teethB)) / 2;
    const rA = outerRadius(teethA, module);
    const rB = outerRadius(teethB, module);
    c.groupB.position.x = D;
    c.pair.position.x = -((-rA + (D + rB)) / 2); // centre the pair
    c.ratio = teethA / teethB;
    c.phaseB = teethB % 2 === 0 ? Math.PI / teethB : 0;
    c.R = Math.hypot((D + rA + rB) / 2, Math.max(rA, rB));

    if (!c.interacted) frame(c);
  }, [gearA, gearB, teethA, teethB, module]);

  return <div className="preview" ref={host} />;
}

/** Position the camera to fit the whole pair for the current aspect ratio. */
function frame(c: Ctx) {
  const vHalf = THREE.MathUtils.degToRad(FOV / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * c.camera.aspect);
  c.camera.position.set(0, 0, (c.R / Math.sin(Math.min(vHalf, hHalf))) * 1.08);
  c.controls.target.set(0, 0, 0);
  c.controls.minDistance = c.R * 0.5;
  c.controls.maxDistance = c.R * 12;
  c.controls.update();
}
