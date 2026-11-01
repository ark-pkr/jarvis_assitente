import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const dataDirectory = process.env.JARVIS_DATA_DIR || fileURLToPath(new URL('../.jarvis-data', import.meta.url))
export const dataPath = (...parts) => path.join(dataDirectory, ...parts)
