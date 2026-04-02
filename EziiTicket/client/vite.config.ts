import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
      "@api": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src/api"),
      "@store": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src/store"),
      "@components": path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "./src/components"
      ),
      "@hooks": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src/hooks"),
      "@pages": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src/pages"),
      "@types": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src/types"),
      "@utils": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src/utils"),
    },
  },
})
