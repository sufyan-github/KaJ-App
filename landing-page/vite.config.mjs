import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Large source images stay in public/assets as originals, but the page uses the optimized
// copies in public/assets/img, so keep the originals out of the deployable bundle.
const SOURCE_ONLY_ASSETS = [
  "kaaj-community-hero.png",
  "kaaj-hero.png",
  "kaaj-hero.webp",
  "kaaj-journeys.png",
  "kaaj-journeys.webp",
  "kaaj-trust.png",
  "kaaj-trust.webp",
  "kaaj-logo.png",
  "kaaj-logo-under-1mb.png",
];

function omitSourceAssets() {
  let outDir;
  return {
    name: "kaaj-omit-source-assets",
    apply: "build",
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      for (const file of SOURCE_ONLY_ASSETS) rmSync(path.join(outDir, "assets", file), { force: true });
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), omitSourceAssets()],
});
