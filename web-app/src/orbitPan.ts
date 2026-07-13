/**
 * Two-finger trackpad horizontal scroll pans the camera left/right.
 *
 * OrbitControls' built-in wheel handler only reads deltaY (for zoom), so a
 * horizontal-only swipe (deltaX, ~0 deltaY) does nothing by default. This
 * attaches a capture-phase 'wheel' listener that detects a horizontal-
 * dominant gesture, pans the camera + controls.target along the camera's
 * local right axis, and stops the event from also reaching OrbitControls'
 * own listener (so it doesn't try to zoom at the same time). Vertical /
 * diagonal scroll (zoom intent) is left completely untouched — capture-phase
 * only intercepts what it explicitly handles.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function attachHorizontalWheelPan(
  element: HTMLElement,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  onInteract?: () => void,
): () => void {
  const right = new THREE.Vector3();
  const handler = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical/diagonal -> leave to OrbitControls (zoom)
    e.preventDefault();
    e.stopPropagation();
    onInteract?.();

    right.setFromMatrixColumn(camera.matrixWorld, 0); // camera's local +X in world space
    const dist = camera.position.distanceTo(controls.target);
    const scale = dist * 0.0015; // pan speed scales with zoom so it feels consistent
    const offset = right.multiplyScalar(-e.deltaX * scale);
    camera.position.add(offset);
    controls.target.add(offset);
    controls.update();
  };
  element.addEventListener("wheel", handler, { passive: false, capture: true });
  return () => element.removeEventListener("wheel", handler, { capture: true } as EventListenerOptions);
}
