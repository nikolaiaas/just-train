import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 11010,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:11009",
        changeOrigin: true,
        // Both servers bind loopback. The proxy presents the controller's exact
        // trusted origin; its CSRF token requirement still applies to mutations.
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest) => {
            proxyRequest.setHeader("Host", "127.0.0.1:11009");
            proxyRequest.setHeader("Origin", "http://127.0.0.1:11009");
          });
        },
      },
    },
  },
});
