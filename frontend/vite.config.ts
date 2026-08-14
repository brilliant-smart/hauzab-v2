import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/", // Production base path
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    // App-shell PWA. The service worker precaches the built assets and serves
    // the SPA shell offline; navigation falls back to index.html so client
    // routes resolve without a network. /api is explicitly excluded — offline
    // sales are queued in IndexedDB by the app's outbox, not served from cache.
    VitePWA({
      registerType: "autoUpdate",
      // favicon.svg is a ~2 MB SVG-with-embedded-PNG and is intentionally NOT
      // precached — it would bloat every install and bust Workbox's 2 MiB asset
      // limit. It still ships from public/ as a plain file; a lean SVG favicon
      // replaces it in Phase 5.
      includeAssets: ["favicon.ico", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Hauzab",
        short_name: "Hauzab",
        description: "Hauzab — inventory & point of sale",
        // Neutral slate until branding is finalized (Phase 5).
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        globIgnores: ["**/favicon.svg"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
  },
}));