/**
 * Two bevel gears positioned as a correctly-assembled 90-degree pair: shared
 * apex at the origin, gear A's axis along +Z, gear B's axis along +X (a
 * rotation of gamma B's own local Z onto world X). Both gears' pitch-cone
 * outer edges land on the shared sphere of radius Ro centred at the apex —
 * the geometric signature of a correctly meshing bevel pair.
 *
 * Static (not animated): true bevel-tooth contact kinematics vary along the
 * cone and are a materially harder problem than the parallel-shaft case: a
 * simplified counter-rotation could easily look subtly wrong. The whole pair
 * auto-spins as one rigid body when idle (presentation only, not a meshing
 * simulation) and stops the moment you orbit/pan/zoom it yourself.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { attachHorizontalWheelPan } from "./orbitPan.js";

interface Props {
  gearA: THREE.BufferGeometry | null;
  gearB: THREE.BufferGeometry | null;
  teethA: number;
  teethB: number;
  module: number;
  faceWidth: number;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  matA: THREE.MeshStandardMaterial;
  matB: THREE.MeshStandardMaterial;
  pair: THREE.Group; // idle auto-spins as one rigid body
  offsetA: THREE.Group; // axial offset along local Z before A's (identity) orientation
  offsetB: THREE.Group; // axial offset along local Z before B's 90deg-about-Y orientation
  meshA: THREE.Mesh | null;
  meshB: THREE.Mesh | null;
  spin: boolean;
  spinT: number;
  raf: number;
}

function display(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  return toCreasedNormals(geo.clone(), THREE.MathUtils.degToRad(30));
}

/** Pitch (cone half-)angle for two gears meshing at 90deg, radians. */
function pitchAngle(teeth: number, mate: number): number {
  return Math.atan2(teeth, mate);
}

export default function BevelPreview({ gearA, gearB, teethA, teethB, module, faceWidth }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Ctx | null>(null);

  // ---- build once ----
  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20000);
    camera.position.set(45, 40, 110);
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
    controls.enablePan = true;
    controls.rotateSpeed = 0.9;

    const pair = new THREE.Group();
    const offsetA = new THREE.Group(); // A: identity orientation, axis already along world Z
    const offsetB = new THREE.Group();
    offsetB.rotation.y = Math.PI / 2; // maps B's local +Z (its rotation axis) onto world +X
    pair.add(offsetA, offsetB);
    scene.add(pair);

    const matA = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x2b7a9e, metalness: 0.15, roughness: 0.55 });
    const c: Ctx = { renderer, scene, camera, controls, matA, matB, pair, offsetA, offsetB, meshA: null, meshB: null, spin: true, spinT: 0, raf: 0 };
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
      // Oscillate rather than spin all the way around: at 90deg from the
      // camera's own diagonal, whichever gear's axis has swung perpendicular
      // to the view direction goes edge-on, and its thin tooth side-walls get
      // wildly stretched by perspective at that grazing angle (looks like a
      // broken, spiky mesh even though the geometry itself is correct — this
      // is the same effect that makes a coin look like a sliver photographed
      // edge-on). Staying within +-32deg of the front-on angle keeps both
      // gears' faces close enough to the camera that neither ever grazes.
      if (c.spin) {
        c.spinT += 0.008;
        c.pair.rotation.y = Math.sin(c.spinT) * THREE.MathUtils.degToRad(32);
      }
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
      matA.dispose();
      matB.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  // ---- rebuild + reposition when parameters change ----
  useEffect(() => {
    const c = ctx.current;
    if (!c || !gearA || !gearB) return;

    if (c.meshA) { c.offsetA.remove(c.meshA); c.meshA.geometry.dispose(); }
    if (c.meshB) { c.offsetB.remove(c.meshB); c.meshB.geometry.dispose(); }
    c.meshA = new THREE.Mesh(display(gearA), c.matA);
    c.meshB = new THREE.Mesh(display(gearB), c.matB);
    c.offsetA.add(c.meshA);
    c.offsetB.add(c.meshB);

    const gammaA = pitchAngle(teethA, teethB);
    const gammaB = pitchAngle(teethB, teethA);
    const Ro = (module / 2) * Math.hypot(teethA, teethB);
    // Apex-to-large-end axial distance along each gear's own rotation axis;
    // the gear mesh is centred on local Z=0, so shift it out by (that
    // distance - halfFace). This MUST be set on the mesh itself (translate
    // in local space), not on the offsetB group — offsetB.position would
    // translate in the PARENT's (world) frame BEFORE offsetB's own 90°
    // rotation is applied, which puts it on the wrong axis entirely.
    c.meshA.position.set(0, 0, Ro * Math.cos(gammaA) - faceWidth / 2);
    c.meshB.position.set(0, 0, Ro * Math.cos(gammaB) - faceWidth / 2);

    const R = Ro * 1.6;
    if (c.spin) {
      const dist = R * 1.4;
      c.camera.position.set(dist * 0.45, dist * 0.4, dist * 1.1);
      c.controls.target.set(0, 0, 0);
      c.controls.minDistance = R * 0.4;
      c.controls.maxDistance = R * 10;
      c.controls.update();
    }
  }, [gearA, gearB, teethA, teethB, module, faceWidth]);

  return <div className="preview" ref={host} />;
}
