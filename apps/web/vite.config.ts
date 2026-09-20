import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4747",
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
});
