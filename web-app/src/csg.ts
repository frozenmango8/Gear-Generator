/**
 * Boolean backend using manifold-3d — the WASM build of the same manifold3d
 * engine the Python port used (trimesh's backend). Chosen after three-bvh-csg
 * (174 open edges) and three-csg-ts (1025 open edges) both failed the
 * watertight test on the label union. manifold-3d guarantees manifold output.
 *
 * WASM init is async and one-time: await initManifold() before generating
 * labeled fit gauges. The union itself is then synchronous.
 */

import * as THREE from "three";
import Module from "manifold-3d";
import { weld } from "./common.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any = null;

/** Load and set up the manifold WASM module once. Safe to call repeatedly. */
export async function initManifold(): Promise<void> {
  if (mod) return;
  mod = await Module();
  mod.setup();
}

export function manifoldReady(): boolean {
  return mod !== null;
}

function geometryToManifold(geo: THREE.BufferGeometry) {
  const g = weld(geo); // ensure indexed + position-welded (manifold input must be clean)
  const pos = g.getAttribute("position").array as ArrayLike<number>;
  const idx = g.getIndex()!.array as ArrayLike<number>;
  const mesh = new mod.Mesh({
    numProp: 3,
    vertProperties: Float32Array.from(pos),
    triVerts: Uint32Array.from(idx),
  });
  mesh.merge();
  return new mod.Manifold(mesh);
}

function manifoldToGeometry(manifold: unknown): THREE.BufferGeometry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (manifold as any).getMesh();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(m.vertProperties, m.numProp));
  geo.setIndex(new THREE.BufferAttribute(m.triVerts, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Union a base geometry with N part geometries, returning a single watertight
 * BufferGeometry. Part positions must already be baked into their geometry.
 */
export function unionAll(
  base: THREE.BufferGeometry,
  parts: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  if (!mod) {
    throw new Error(
      "manifold-3d not initialised — await initManifold() before unioning.",
    );
  }
  let acc = geometryToManifold(base);
  for (const part of parts) {
    acc = mod.Manifold.union(acc, geometryToManifold(part));
  }
  return manifoldToGeometry(acc);
}
