import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // manifold-3d ships its own WASM; let Vite serve it rather than pre-bundle.
  optimizeDeps: { exclude: ["manifold-3d"] },
  build: { target: "es2020" },
});
