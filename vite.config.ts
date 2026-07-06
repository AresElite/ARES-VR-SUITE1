import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// A.R.E.S. VR Performance Suite
// WebXR requires a secure context. `vite --host` + Quest on same network works
// for LAN testing via `adb reverse` or use the Netlify deploy preview (HTTPS).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
