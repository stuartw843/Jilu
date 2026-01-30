import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Keep dev warnings at bay while we chunk vendor/editor code
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@tiptap") || id.includes("marked")) {
              return "editor";
            }
            if (id.includes("@tauri-apps")) {
              return "tauri";
            }
            return "vendor";
          }

          if (id.includes("src/ui/editor")) return "editor-ui";
          if (id.includes("src/ui/tasks") || id.includes("src/tasks")) return "tasks-ui";
          if (id.includes("src/ui/transcript") || id.includes("src/recording")) return "transcript";

          return undefined;
        },
      },
    },
  },
}));
