import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
const root = fileURLToPath(new URL('.', import.meta.url))

const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const DEFAULT_BRIDGE_PORT = '8787'

/** The port the interface will dial, from the same settings the bridge reads. */
export function bridgePort(env: Record<string, string | undefined>): string {
  const url = env.VITE_BRIDGE_URL?.trim()
  return (url && new URL(url).port) || env.JARVIS_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT
}

/**
 * The page's CSP names the bridge by port, so moving the bridge has to move the
 * policy too. Left alone, the page refuses to talk to a bridge it dialled
 * itself, and every symptom points at the service rather than at this file.
 */
export function applyBridgePort(html: string, port: string): string {
  return html.replace(/(localhost|127\.0\.0\.1):8787/g, `$1:${port}`)
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'jarvis-bridge-port',
    transformIndexHtml: (html: string) => applyBridgePort(html, bridgePort(loadEnv(mode, root, ''))),
  }],
  define: {
    __JARVIS_VERSION__: JSON.stringify(version),
    __JARVIS_BRIDGE_PORT__: JSON.stringify(bridgePort(loadEnv(mode, root, ''))),
  },
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
}))
