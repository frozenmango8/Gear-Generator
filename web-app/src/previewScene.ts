/**
 * Shared WebGL scaffolding for the three previews (single gear, meshing pair,
 * bevel pair). All three want the same thing: a renderer/scene/camera/controls
 * rig built ONCE and reused, with only the mesh geometry swapped when the
 * parameters change (an earlier version tore the whole scene down on every
 * slider tick, which stuttered badly on phones). That rig — lights, damped
 * OrbitControls, the horizontal-wheel pan handler, a ResizeObserver and the
 * requestAnimationFrame loop — was copy-pasted three times; it lives here now.
 *
 * What stays in each preview is only what genuinely differs: its materials,
 * how it lays out and animates its meshes, and how it frames the camera.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { attachHorizontalWheelPan } from "./orbitPan.js";

export interface PreviewScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Tear down the rig: loop, observer, listeners, controls, renderer, canvas. */
  dispose(): void;
}

export interface PreviewSceneOptions {
  /** Initial camera position; previews re-frame from their own geometry later. */
  cameraPosition: [number, number, number];
  fov?: number;
  far?: number;
  /** Any user orbit/pan/zoom — previews use it to stop their idle animation. */
  onInteract?: () => void;
  /** Runs each frame, before controls.update() and the render. */
  onFrame?: () => void;
  /** Runs after the canvas is resized, and once at construction. */
  onResize?: (view: PreviewScene) => void;
}

export const PREVIEW_FOV = 40;

export function createPreviewScene(
  el: HTMLElement,
  { cameraPosition, fov = PREVIEW_FOV, far = 20000, onInteract, onFrame, onResize }: PreviewSceneOptions,
): PreviewScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, far);
  camera.position.set(...cameraPosition);

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

  const interact = () => onInteract?.();
  controls.addEventListener("start", interact);
  const detachWheelPan = attachHorizontalWheelPan(renderer.domElement, camera, controls, interact);

  let raf = 0;
  const view: PreviewScene = {
    renderer,
    scene,
    camera,
    controls,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      detachWheelPan();
      controls.removeEventListener("start", interact);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    },
  };

  const resize = () => {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || w;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize?.(view);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize(); // `view` is fully built above, so onResize can use it here too

  const loop = () => {
    onFrame?.();
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();

  return view;
}

/**
 * Clone a generated geometry for display, with creased (faceted-where-sharp)
 * normals so the teeth read crisply.
 *
 * `centerOnZ` re-centres on the Z axis ONLY — x/y stay at their native origin.
 * That matters: the gear's bore and the shaft profile are both built around
 * (0,0), so leaving x/y untouched is what makes the shaft land exactly seated
 * in the bore, flat orientation included, with no separate alignment step.
 */
export function displayGeometry(source: THREE.BufferGeometry, centerOnZ = true): THREE.BufferGeometry {
  const g = source.clone();
  if (centerOnZ) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(0, 0, -(b.max.z + b.min.z) / 2);
  }
  const creased = toCreasedNormals(g, THREE.MathUtils.degToRad(30));
  g.dispose();
  return creased;
}
