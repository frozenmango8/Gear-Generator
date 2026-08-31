/**
 * Self-contained artifact entry. Nothing in the generator needs WASM or a
 * network fetch, so the artifact and the full app are identical — this just
 * mounts the same App, and everything inlines into a single HTML file.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./gui.js";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
