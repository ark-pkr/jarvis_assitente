const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { parseEnv } = require('node:util')
app.setName('JARVIS')
app.whenReady().then(async () => {
  const directory = path.join(app.getPath('appData'), 'JARVIS')
  const filename = path.join(directory, 'desktop-settings.json')
  await fs.mkdir(directory, { recursive: true })
  let config = {}
  try { config = JSON.parse(await fs.readFile(filename, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!config.encryptedKey) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Proteção de credenciais indisponível.')
    const values = parseEnv(await fs.readFile(path.resolve('.env.local'), 'utf8'))
    if (!values.GEMINI_API_KEY) throw new Error('Chave Gemini não encontrada na configuração atual.')
    config.encryptedKey = safeStorage.encryptString(values.GEMINI_API_KEY).toString('base64')
    config.model = values.JARVIS_MODEL || 'gemini-3.5-flash'
  }
  if (!config.dataImported) {
    const source = path.resolve('.jarvis-data')
    await fs.cp(source, path.join(directory, 'dados'), { recursive: true, force: false, errorOnExist: false, filter: (file) => !/browser-profile|launcher\.pid|\.log$|integrations/.test(file) })
    config.dataImported = true
  }
  await fs.writeFile(filename, JSON.stringify(config, null, 2))
  console.log('Chave existente protegida pelo Windows e dados locais preparados para o aplicativo. Nenhuma chave foi incluída no instalador.')
  app.quit()
}).catch((error) => { console.error(error.message); app.exit(1) })
