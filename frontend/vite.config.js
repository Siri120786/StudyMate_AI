import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Split the vendor code so the browser downloads, caches and parses it separately from the app's own code.
function chunkFor(id) {
  if (!id.includes("node_modules")) return undefined;
  if (/react-markdown|remark|rehype|micromark|mdast|hast|unified|unist|vfile|decode-named|character-entities|property-information|space-separated|comma-separated|bail|trough|devlop|is-plain|ccount|markdown-table|trim-lines|zwitch|longest-streak|stringify-entities|parse-entities|style-to-|inline-style/.test(id)) return "markdown";
  if (id.includes("@supabase") || id.includes("/jose/")) return "supabase";
  if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return "react";
  return undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first, which adds about 0.2 s to every request.
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  preview: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { rollupOptions: { output: { manualChunks: chunkFor } }, chunkSizeWarningLimit: 400 },
});
