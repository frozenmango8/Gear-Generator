/**
 * Turn the single-file artifact build into content-only HTML for a claude.ai
 * Artifact: strips the outer <!doctype>/<html>/<head>/<body> (the host adds
 * its own) and keeps the <style>, #root, and inline module <script>.
 *
 * Usage:
 *   npm run build:artifact          # produces dist-artifact/artifact.html
 *   node make-artifact-content.mjs  # -> dist-artifact/content.html
 */
import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("dist-artifact/artifact.html", "utf8");
const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
// esbuild escapes any internal </script> as <\/script>, so whole-block match is safe.
const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) =>
  m[0].replace(/\s+crossorigin/, ""),
);
const out =
  ["<title>LEGO Gear Generator</title>", ...styles, '<div id="root"></div>', ...scripts].join("\n") +
  "\n";
writeFileSync("dist-artifact/content.html", out);
console.log(`Wrote dist-artifact/content.html (${out.length} bytes, ${scripts.length} script, ${styles.length} style)`);
