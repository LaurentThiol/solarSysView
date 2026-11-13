import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: webRoot,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    commonjsOptions: {
      include: [/ephemeris/, /node_modules/],
    },
  },
  server: {
    host: "0.0.0.0",
    port: 47121,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": { target: "http://127.0.0.1:47120", ws: true },
      "/red": { target: "http://127.0.0.1:47120", ws: true },
    },
  },
});
