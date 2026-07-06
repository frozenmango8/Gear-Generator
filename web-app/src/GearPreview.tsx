/** Auto-spinning bird's-eye 3D preview of a gear geometry. Resizes with its
 *  container (orientation changes, window resize, layout reflow). */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export default function GearPreview({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !geometry) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const centered = geometry.clone();
    centered.center();
    // Hard edges where the flat face meets the walls (crease > ~30 deg), smooth
    // along the curved bore and tooth flanks — removes the smooth-normal
    // "pinwheel" shading around the hole.
    const g = toCreasedNormals(centered, THREE.MathUtils.degToRad(30));
    centered.dispose();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, metalness: 0.15, roughness: 0.55 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.rotation.x = 0; // bird's-eye: gear face toward the camera
    scene.add(mesh);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 8);
    scene.add(key);
    g.computeBoundingSphere();
    const camDist = (g.boundingSphere?.radius ?? 20) * 3.2;
    camera.position.set(0, 0, camDist);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const loop = () => {
      mesh.rotation.z += 0.01;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      g.dispose();
      mat.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [geometry]);

  return <div className="preview" ref={ref} />;
}
