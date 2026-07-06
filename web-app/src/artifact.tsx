/**
 * Self-contained artifact entry. With LEGO/manifold removed, the artifact and
 * the full app are identical (no WASM anywhere), so this just mounts the same
 * App. Everything inlines into one HTML file with no network requests.
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
