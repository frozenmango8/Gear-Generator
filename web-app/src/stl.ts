/**
 * STL export -> browser Blob download (replaces Python's mesh.export(path)).
 * No server round-trip: the binary STL is built client-side and downloaded.
 */

import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

/** Serialize a geometry to a binary STL Blob. */
export function geometryToStlBlob(geometry: THREE.BufferGeometry): Blob {
  const mesh = new THREE.Mesh(geometry);
  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true }) as unknown as DataView;
  // Copy into a fresh (non-shared) ArrayBuffer so the type is a valid BlobPart.
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
  return new Blob([bytes], { type: "model/stl" });
}

/** Trigger a browser download of a geometry as an .stl file. */
export function downloadStl(geometry: THREE.BufferGeometry, filename: string): void {
  const blob = geometryToStlBlob(geometry);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".stl") ? filename : `${filename}.stl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
