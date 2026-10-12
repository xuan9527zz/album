import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { pwaPlugin } from "./scripts/pwa-plugin.ts";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production" && env.VITE_LOCAL_DEMO === "true")
    throw new Error("Production demo build is forbidden");
  const base = env.VITE_BASE_PATH || "/";
  if (!base.startsWith("/") || !base.endsWith("/"))
    throw new Error("VITE_BASE_PATH must start and end with /");
  return {
    root: "apps/web",
    base,
    plugins: [react(), pwaPlugin(base, env.VITE_APP_NAME || "拾光相册")],
    envDir: "../..",
    build: { outDir: "../../dist", emptyOutDir: true },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173 },
  };
});
