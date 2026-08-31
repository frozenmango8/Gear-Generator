/**
 * Two gears meshing at true relative size and correct centre distance. The
 * gears always counter-rotate (the meshing demo); drag to orbit and
 * scroll/pinch to zoom the camera. The renderer/scene/camera/controls rig
 * comes from createPreviewScene(); the meshes are rebuilt only when the
 * parameters change.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { outerRadius } from "./common.js";
import { createPreviewScene, displayGeometry, PreviewScene, PREVIEW_FOV } from "./previewScene.js";

interface Props {
  gearA: THREE.BufferGeometry | null;
  gearB: THREE.BufferGeometry | null;
  teethA: number;
  teethB: number;
  module: number;
}

interface Ctx {
  view: PreviewScene;
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
  interacted: boolean;
}

export default function MeshPreview({ gearA, gearB, teethA, teethB, module }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<Ctx | null>(null);

  // ---- build once ----
  useEffect(() => {
    const el = host.current!;
    const groupA = new THREE.Group();
    const groupB = new THREE.Group();
    const pair = new THREE.Group();
    pair.add(groupA, groupB);
    const matA = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x2b7a9e, metalness: 0.15, roughness: 0.55 });

    const view = createPreviewScene(el, {
      cameraPosition: [0, 0, 100],
      onInteract: () => { if (ctx.current) ctx.current.interacted = true; },
      onFrame: () => {
        const c = ctx.current;
        if (!c) return;
        c.angleA += 0.008;
        c.groupA.rotation.z = c.angleA;
        c.groupB.rotation.z = -c.angleA * c.ratio + c.phaseB;
      },
      onResize: () => {
        const c = ctx.current;
        if (c && !c.interacted) frame(c);
      },
    });
    view.scene.add(pair);

    const c: Ctx = {
      view, matA, matB, groupA, groupB, pair, meshA: null, meshB: null,
      angleA: 0, ratio: 1, phaseB: 0, R: 40, interacted: false,
    };
    ctx.current = c;

    return () => {
      view.dispose();
      c.meshA?.geometry.dispose();
      c.meshB?.geometry.dispose();
      matA.dispose();
      matB.dispose();
      ctx.current = null;
    };
  }, []);

  // ---- rebuild the pair when parameters change ----
  useEffect(() => {
    const c = ctx.current;
    if (!c || !gearA || !gearB) return;

    if (c.meshA) { c.groupA.remove(c.meshA); c.meshA.geometry.dispose(); }
    if (c.meshB) { c.groupB.remove(c.meshB); c.meshB.geometry.dispose(); }
    c.meshA = new THREE.Mesh(displayGeometry(gearA), c.matA);
    c.meshB = new THREE.Mesh(displayGeometry(gearB), c.matB);
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
  const { camera, controls } = c.view;
  const vHalf = THREE.MathUtils.degToRad(PREVIEW_FOV / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  camera.position.set(0, 0, (c.R / Math.sin(Math.min(vHalf, hHalf))) * 1.08);
  controls.target.set(0, 0, 0);
  controls.minDistance = c.R * 0.5;
  controls.maxDistance = c.R * 12;
  controls.update();
}
