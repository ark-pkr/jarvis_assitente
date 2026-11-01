import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import electron from 'electron'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (existsSync('.env.local')) env.JARVIS_IMPORT_ENV = path.resolve('.env.local')
if (existsSync('.jarvis-data')) env.JARVIS_IMPORT_DATA = path.resolve('.jarvis-data')
const child = spawn(electron, [path.resolve('desktop-app')], { env, stdio: 'inherit', windowsHide: false })
child.on('exit', (code) => process.exit(code || 0))
