/**
 * Two gears meshing: shown at true relative size and correct center distance
 * (module * (teethA + teethB) / 2), counter-rotating at the right ratio with
 * teeth interlocked. This is the visual confirmation that two same-module
 * gears mesh regardless of tooth count.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { outerRadius } from "./common.js";

interface Props {
  gearA: THREE.BufferGeometry | null;
  gearB: THREE.BufferGeometry | null;
  teethA: number;
  teethB: number;
  module: number;
}

function display(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  g.computeBoundingBox();
  const z = g.boundingBox!;
  g.translate(0, 0, -(z.max.z + z.min.z) / 2); // centre in Z so both are coplanar
  return toCreasedNormals(g, THREE.MathUtils.degToRad(30));
}

export default function MeshPreview({ gearA, gearB, teethA, teethB, module }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !gearA || !gearB) return;

    const scene = new THREE.Scene();
    const FOV = 40;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 8);
    scene.add(key);

    const matA = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x2b7a9e, metalness: 0.15, roughness: 0.55 });
    const gA = display(gearA);
    const gB = display(gearB);
    const meshA = new THREE.Mesh(gA, matA);
    const meshB = new THREE.Mesh(gB, matB);

    const D = (module * (teethA + teethB)) / 2; // centre distance
    const rA = outerRadius(teethA, module);
    const rB = outerRadius(teethB, module);

    // groups so each gear spins about its own centre; pair centred for framing
    const groupA = new THREE.Group();
    groupA.add(meshA);
    const groupB = new THREE.Group();
    groupB.add(meshB);
    groupB.position.x = D;
    const pair = new THREE.Group();
    pair.add(groupA, groupB);
    const centreX = (-rA + (D + rB)) / 2;
    pair.position.x = -centreX;
    scene.add(pair);

    // interlock phase: A always presents a tooth toward B (tooth centred at 0);
    // B needs a gap facing A — a half-pitch offset only when teethB is even.
    const phaseB = teethB % 2 === 0 ? Math.PI / teethB : 0;
    const ratio = teethA / teethB;

    const R = Math.hypot((D + rA + rB) / 2, Math.max(rA, rB));
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const vHalf = THREE.MathUtils.degToRad(FOV / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      camera.position.set(0, 0, (R / Math.sin(Math.min(vHalf, hHalf))) * 1.08);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let angleA = 0;
    const loop = () => {
      angleA += 0.008;
      groupA.rotation.z = angleA;
      groupB.rotation.z = -angleA * ratio + phaseB;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      gA.dispose();
      gB.dispose();
      matA.dispose();
      matB.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [gearA, gearB, teethA, teethB, module]);

  return <div className="preview" ref={ref} />;
}
