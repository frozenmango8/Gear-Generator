/** Auto-spinning bird's-eye 3D preview of a gear geometry. */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function GearPreview({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !geometry) return;
    const w = host.clientWidth || 360;
    const h = host.clientHeight || 360;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const g = geometry.clone();
    g.center();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.rotation.x = 0; // bird's-eye: gear face toward the camera
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
