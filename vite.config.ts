import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
const root = fileURLToPath(new URL('.', import.meta.url))

const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: { __JARVIS_VERSION__: JSON.stringify(version) },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        helios: resolve(root, 'holograma_3d_reator_helios_v4_1_cinematic.html'),
      },
    },
  },
  server: {
    // Honour PORT so a second instance can run alongside the first. The bridge
    // only accepts sockets from localhost:5173-5199, so stay inside that range
    // or set JARVIS_ALLOWED_ORIGINS to match.
    port: Number(process.env.PORT) || 5173,
    // Build output and browser profiles change constantly and none of it is
    // source; watching them turns a packaging run into a stream of page reloads.
    watch: { ignored: ['**/release/**', '**/desktop-app/**', '**/.ui-check.local/**', '**/.browser-profile/**', '**/.jarvis-data/**'] },
  },
})
