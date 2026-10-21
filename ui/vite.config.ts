import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
// Versión única del sistema: package.json de la raíz del proyecto.
const version: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
let build = "local";
try {
  build = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* sin git: se usa "local" */
}
export default defineConfig({
  plugins: [tailwindcss(), vue()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(`${build} · ${new Date().toISOString().slice(0, 10)}`),
  },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } } },
});
