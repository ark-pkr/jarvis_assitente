import electron from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [path.resolve('scripts/migrate-desktop.cjs')], { env, stdio: 'inherit', windowsHide: true })
child.on('exit', (code) => process.exit(code || 0))
