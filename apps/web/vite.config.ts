import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

import { getEotionBuildInfo } from "../../scripts/build-info.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const buildInfo = getEotionBuildInfo();

  return {
    plugins: [vue()],
    define: {
      __EOTION_VERSION__: JSON.stringify(buildInfo.version),
      __EOTION_BUILD_NUMBER__: JSON.stringify(buildInfo.buildNumber),
      __EOTION_GIT_SHA__: JSON.stringify(buildInfo.gitSha),
    },
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
    preview: {
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
