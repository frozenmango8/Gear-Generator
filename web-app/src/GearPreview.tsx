/**
 * Bird's-eye 3D gear preview. Idle: the gear auto-spins in-plane. Drag to
 * orbit, scroll/pinch to zoom — grabbing it stops the idle spin so you can
 * inspect it. The renderer/scene/camera/controls rig comes from
 * createPreviewScene(); only the mesh geometry is swapped when it changes.
 *
 * Optional `shaft` geometry renders seated in the bore, world-fixed (it does
 * NOT spin with the gear) so you can see the shaft poking through and confirm
 * the fit visually before printing — like a stationary axle the gear turns on.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createPreviewScene, displayGeometry, PreviewScene } from "./previewScene.js";

interface Ctx {
  view: PreviewScene;
  gearGroup: THREE.Group; // spins
  mat: THREE.MeshStandardMaterial;
  shaftMat: THREE.MeshStandardMaterial;
  mesh: THREE.Mesh | null;
  shaftMesh: THREE.Mesh | null; // world-fixed, does not spin
  spin: boolean;
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
    const gearGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8a95a1, metalness: 0.45, roughness: 0.35 });

    // The callbacks read through `ctx` (the same ref every other effect uses),
    // so they see live state and no-op after cleanup nulls it out.
    const view = createPreviewScene(el, {
      cameraPosition: [0, 0, 60],
      far: 5000,
      onInteract: () => { if (ctx.current) ctx.current.spin = false; },
      onFrame: () => {
        const c = ctx.current;
        if (c?.spin) c.gearGroup.rotation.z += 0.01; // shaft is NOT in gearGroup -> stays fixed
      },
    });
    view.scene.add(gearGroup);

    const c: Ctx = { view, gearGroup, mat, shaftMat, mesh: null, shaftMesh: null, spin: true };
    ctx.current = c;

    return () => {
      view.dispose();
      c.mesh?.geometry.dispose();
      c.shaftMesh?.geometry.dispose();
      mat.dispose();
      shaftMat.dispose();
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
    const g = displayGeometry(geometry);
    const mesh = new THREE.Mesh(g, c.mat);
    c.gearGroup.add(mesh);
    c.mesh = mesh;

    g.computeBoundingSphere();
    const r = g.boundingSphere?.radius ?? 20;
    c.view.controls.minDistance = r * 1.1;
    c.view.controls.maxDistance = r * 10;
    if (c.spin) {
      // not yet grabbed: keep the framed bird's-eye view as the gear resizes
      c.view.camera.position.set(0, 0, r * 3.0);
      c.view.controls.target.set(0, 0, 0);
      c.view.controls.update();
    }
  }, [geometry]);

  // ---- swap shaft geometry in place (world-fixed, not part of gearGroup) ----
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (c.shaftMesh) {
      c.view.scene.remove(c.shaftMesh);
      c.shaftMesh.geometry.dispose();
      c.shaftMesh = null;
    }
    if (!shaft) return;
    const mesh = new THREE.Mesh(displayGeometry(shaft), c.shaftMat);
    c.view.scene.add(mesh);
    c.shaftMesh = mesh;
  }, [shaft]);

  return <div className="preview" ref={host} />;
}
