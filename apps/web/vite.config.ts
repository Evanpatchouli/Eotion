import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [vue()],
    server: {
      host: "0.0.0.0",
      port: env.VITE_PORT ? parseInt(env.VITE_PORT) : 7173,
      proxy: {
        "/api": {
          target: env.EOTION_API_PROXY_TARGET || "http://127.0.0.1:7137",
          changeOrigin: false,
        },
      },
    },
    build: {
      target: "es2022",
    },
  };
});
