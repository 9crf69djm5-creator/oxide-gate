import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const adminProxy = {
    "/api/admin": {
      target: env.VITE_ADMIN_PROXY_TARGET || env.VITE_API_BASE_URL || "https://oxide-gate-api.onrender.com",
      changeOrigin: true,
      secure: true,
    },
  };
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: adminProxy,
    },
    preview: {
      port: 4173,
      host: true,
      proxy: adminProxy,
    },
  };
});
