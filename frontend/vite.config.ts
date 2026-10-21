import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    // The backend sends no CORS headers and binds to localhost, so dev goes through this proxy.
    proxy: { "/api": process.env.BACKEND_URL ?? "http://127.0.0.1:3001" },
  },
});
