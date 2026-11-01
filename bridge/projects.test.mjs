import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ProjectFiles, sandboxArgs } from './projects.mjs'

const yes = async () => ({ approved: true })
const no = async () => ({ approved: false })
async function fixture() {
  const area = path.resolve('.ui-check.local')
  await fs.mkdir(area, { recursive: true })
  const base = await fs.mkdtemp(path.join(area, 'files-'))
  const directory = path.join(base, 'project')
  await fs.mkdir(directory)
  await fs.writeFile(path.join(directory, 'main.js'), 'const total = 1;\n')
  await fs.writeFile(path.join(directory, '.env.local'), 'secret-test')
  const files = new ProjectFiles(path.join(base, 'journal'))
  const root = await files.register(directory, yes)
  return { files, root, directory, base }
}
async function approvePlan(files, root, directory, entries, confirm = yes, configurationNeeded = false) {
  return files.planProject(root.id, directory, 'api', 'API demonstrativa', 'Node.js + TypeScript', 'A equipe já usa Node e TypeScript, reduzindo manutenção.', ['Criar endpoint HTTP', 'Validar entradas'], ['Teste automatizado passa', 'README explica instalação e execução'], entries.map((entry) => entry.file), ['npm test'], configurationNeeded, confirm)
}

test('authorization, path traversal, credentials and junctions are enforced', async () => {
  const { files, root, directory, base } = await fixture()
  const denied = new ProjectFiles(path.join(base, 'denied'))
  await assert.rejects(() => denied.register(directory, no), /não autorizada/)
  assert.equal((await denied.state()).roots.length, 0)
  await assert.rejects(() => files.read('unknown', 'main.js'), /não autorizada/)
  await assert.rejects(() => files.read(root.id, '../main.js'), /fora da pasta/)
  await assert.rejects(() => files.read(root.id, '.env.local'), /reservado/)
  assert.equal((await files.list(root.id)).entries.length, 1)
  const outside = path.join(base, 'outside'); await fs.mkdir(outside)
  await fs.symlink(outside, path.join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(() => files.resolve(root.id, 'linked'), /Links simbólicos/)
})

test('code changes require hash and approval, preserve backup and undo safely', async () => {
  const { files, root, directory } = await fixture()
  const original = await files.read(root.id, 'main.js')
  await assert.rejects(() => files.write(root.id, 'main.js', 'const total = 2;', 'bad-hash', yes), /mudou/)
  await assert.rejects(() => files.write(root.id, 'main.js', 'const total = 2;', original.hash, no), /cancelada/)
  assert.equal((await files.read(root.id, 'main.js')).text, original.text)
  const result = await files.write(root.id, 'main.js', 'const total = 2;', original.hash, yes)
  assert.equal((await files.read(root.id, 'main.js')).text, 'const total = 2;')
  await files.undo(result.id, yes)
  assert.equal((await files.read(root.id, 'main.js')).text, original.text)
  const added = await files.write(root.id, 'new.py', 'print(1)', undefined, yes)
  await fs.writeFile(path.join(directory, 'new.py'), 'print(2)')
  await assert.rejects(() => files.undo(added.id, yes), /alterado depois/)
})

test('edits refuse changes made while approval is open', async () => {
  const { files, root, directory } = await fixture()
  const before = await files.read(root.id, 'main.js')
  await assert.rejects(() => files.write(root.id, 'main.js', 'proposal', before.hash, async () => {
    await fs.writeFile(path.join(directory, 'main.js'), 'external edit')
    return { approved: true }
  }), /mudou durante/)
  assert.equal((await files.read(root.id, 'main.js')).text, 'external edit')
})

test('organizing is preview-only until approved and supports undo without overwrite', async () => {
  const { files, root, directory } = await fixture()
  await fs.writeFile(path.join(directory, 'notes.txt'), 'estudos')
  const plan = await files.plan(root.id, '.', 'tipo')
  assert.equal(plan.moves.length, 2)
  assert.equal(await fs.readFile(path.join(directory, 'notes.txt'), 'utf8'), 'estudos')
  await assert.rejects(() => files.apply(plan.id, no), /cancelada/)
  const result = await files.apply(plan.id, yes)
  assert.equal(result.moved, 2)
  assert.equal(await fs.readFile(path.join(directory, 'Documentos', 'notes.txt'), 'utf8'), 'estudos')
  await files.undo(result.id, yes)
  assert.equal(await fs.readFile(path.join(directory, 'notes.txt'), 'utf8'), 'estudos')
  assert.equal(await fs.stat(path.join(directory, 'Documentos')).then(() => true, () => false), false)
  await fs.mkdir(path.join(directory, 'Documentos'))
  await fs.writeFile(path.join(directory, 'Documentos', 'notes.txt'), 'preservar')
  await assert.rejects(() => files.plan(root.id, '.', 'tipo'), /Conflito/)
  assert.equal(await fs.readFile(path.join(directory, 'Documentos', 'notes.txt'), 'utf8'), 'preservar')
})

test('custom project organization previews bounded moves, creates nested folders and safely undoes them', async () => {
  const { files, root, directory } = await fixture()
  await fs.mkdir(path.join(directory, 'inbox'))
  await fs.writeFile(path.join(directory, 'inbox', 'readme.txt'), 'project notes')
  const plan = await files.planCustom(root.id, '.', [
    { from: 'main.js', to: 'Projetos/Estoque/src/main.js', reason: 'Nome e extensão indicam código do projeto.' },
    { from: 'inbox/readme.txt', to: 'Projetos/Estoque/documentos/readme.txt' },
  ])
  assert.equal(plan.moves.length, 2)
  assert.equal(await fs.readFile(path.join(directory, 'main.js'), 'utf8'), 'const total = 1;\n')
  await assert.rejects(() => files.apply(plan.id, no), /cancelada/)
  const applied = await files.apply(plan.id, yes)
  assert.equal(applied.moved, 2)
  assert.equal(await fs.readFile(path.join(directory, 'Projetos', 'Estoque', 'src', 'main.js'), 'utf8'), 'const total = 1;\n')
  await files.undo(applied.id, yes)
  assert.equal(await fs.readFile(path.join(directory, 'main.js'), 'utf8'), 'const total = 1;\n')
  assert.equal(await fs.readFile(path.join(directory, 'inbox', 'readme.txt'), 'utf8'), 'project notes')
  assert.equal(await fs.stat(path.join(directory, 'Projetos')).then(() => true, () => false), false)
})

test('custom project organization rejects traversal, hidden files, duplicate targets and existing destinations', async () => {
  const { files, root, directory } = await fixture()
  await assert.rejects(() => files.planCustom(root.id, '.', [{ from: '../outside.txt', to: 'safe/outside.txt' }]), /caminhos relativos/)
  await assert.rejects(() => files.planCustom(root.id, '.', [{ from: '.env.local', to: 'config/.env.local' }]), /oculto/)
  await assert.rejects(() => files.planCustom(root.id, '.', [
    { from: 'main.js', to: 'a/main.js' }, { from: 'main.js', to: 'b/main.js' },
  ]), /repete/)
  await fs.mkdir(path.join(directory, 'Projetos'))
  await fs.writeFile(path.join(directory, 'Projetos', 'main.js'), 'keep')
  await assert.rejects(() => files.planCustom(root.id, '.', [{ from: 'main.js', to: 'Projetos/main.js' }]), /já existe/)
  assert.equal(await fs.readFile(path.join(directory, 'main.js'), 'utf8'), 'const total = 1;\n')
})

test('a destination created after preview never gets overwritten', async () => {
  const { files, root, directory } = await fixture()
  const plan = await files.plan(root.id, '.', 'tipo')
  await fs.mkdir(path.join(directory, 'Outros'))
  await fs.writeFile(path.join(directory, 'Outros', 'main.js'), 'existing')
  await assert.rejects(() => files.apply(plan.id, yes), /destino já existe/)
  assert.equal(await fs.readFile(path.join(directory, 'main.js'), 'utf8'), 'const total = 1;\n')
  assert.equal(await fs.readFile(path.join(directory, 'Outros', 'main.js'), 'utf8'), 'existing')
})

test('interrupting immediately after approval prevents file moves', async () => {
  const { files, root, directory } = await fixture()
  const plan = await files.plan(root.id, '.', 'tipo')
  const controller = new AbortController()
  await assert.rejects(() => files.apply(plan.id, async () => {
    controller.abort(); return { approved: true }
  }, controller.signal))
  assert.equal(await fs.readFile(path.join(directory, 'main.js'), 'utf8'), 'const total = 1;\n')
})

test('project creation previews the selected stack, never overwrites, and can be undone safely', async () => {
  const { files, root, directory } = await fixture()
  const entries = [
    { file: 'package.json', content: '{"scripts":{"test":"node --test"}}' },
    { file: 'src/index.js', content: 'console.log("ready")' },
    { file: '.gitignore', content: 'node_modules\n' },
    { file: 'README.md', content: '# Nova API\n\n## Instalação\n\n## Uso\n\n## Testes' },
    { file: 'tests/api.test.js', content: 'import test from "node:test"\ntest("placeholder", () => {})\n' },
  ]
  let planApproval
  await assert.rejects(() => approvePlan(files, root, 'nova-api', entries, async (details) => {
    planApproval = details
    return no()
  }), /Plano não aprovado/)
  assert.match(planApproval.details, /Node\.js \+ TypeScript/)
  assert.equal(await fs.stat(path.join(directory, 'nova-api')).then(() => true, () => false), false)

  const plan = await approvePlan(files, root, 'nova-api', entries)
  assert.equal(plan.approved, true)
  let creationApproval
  await assert.rejects(() => files.createProject(plan.planId, entries, async (details) => {
    creationApproval = details
    return no()
  }), /Criação do projeto cancelada/)
  assert.match(creationApproval.details, /Plano aprovado/)
  assert.equal(await fs.stat(path.join(directory, 'nova-api')).then(() => true, () => false), false)

  const created = await files.createProject(plan.planId, entries, yes)
  assert.equal(created.created, true)
  assert.match(created.verification[0], /npm test/)
  assert.deepEqual(await fs.readFile(path.join(directory, 'nova-api', 'src', 'index.js'), 'utf8'), 'console.log("ready")')
  assert.equal((await files.read(root.id, path.join('nova-api', '.gitignore'))).text, 'node_modules\n')
  await assert.rejects(() => files.createProject(plan.planId, entries, yes), /inexistente ou expirado/)
  await files.undo(created.id, yes)
  assert.equal(await fs.stat(path.join(directory, 'nova-api')).then(() => true, () => false), false)
})

test('project creation rejects traversal, credentials, duplicate paths and oversized trees', async () => {
  const { files, root } = await fixture()
  const valid = [
    { file: 'index.js', content: 'ok' },
    { file: 'README.md', content: '# API' },
    { file: 'tests/index.test.js', content: 'test' },
  ]
  await assert.rejects(() => approvePlan(files, root, '../outside', valid), /nome simples/)
  await assert.rejects(() => approvePlan(files, root, 'safe', [
    ...valid, { file: 'src/../index.js', content: 'no traversal' },
  ]), /caminho não permitido/)
  await assert.rejects(() => approvePlan(files, root, 'safe', [
    ...valid, { file: '.env', content: 'secret' },
  ]), /caminho não permitido/)
  await assert.rejects(() => approvePlan(files, root, 'safe', [
    { file: 'Index.js', content: 'a' }, { file: 'index.js', content: 'b' },
  ]), /duplicados/)
  await assert.rejects(() => approvePlan(files, root, 'safe', [
    ...valid, { file: 'src.js', content: 'file' }, { file: 'src.js/index.js', content: 'child' },
  ]), /também é usado como pasta/)
  await assert.rejects(() => approvePlan(files, root, 'safe', Array.from({ length: 101 }, (_, index) => ({
    file: `src/${index}.js`, content: '',
  }))), /plano precisa/)
  const plan = await approvePlan(files, root, 'safe', valid)
  await assert.rejects(() => files.createProject(plan.planId, [
    ...valid.slice(0, 2), { file: 'other.js', content: 'not approved' },
  ], yes), /não correspondem ao plano/)
})

test('sandbox command arguments mount only the project with limits and network policy', () => {
  const args = sandboxArgs({
    image: 'node:22-bookworm-slim', command: 'npm', args: ['test'],
    cwd: 'C:\\projects\\sample', network: 'none', containerName: 'jarvis-test',
  })
  assert.ok(args.includes('--network') && args[args.indexOf('--network') + 1] === 'none')
  assert.ok(args.includes('--read-only'))
  assert.ok(args.includes('--cap-drop=ALL'))
  assert.ok(args.includes('--security-opt=no-new-privileges'))
  assert.ok(args.includes('--pids-limit=128'))
  assert.ok(args.includes('--memory=1g'))
  assert.equal(args.filter((arg) => arg === '--mount').length, 1)
  assert.ok(args.includes('type=bind,source=C:\\projects\\sample,target=/workspace'))
  assert.ok(args.includes('--entrypoint') && args[args.indexOf('--entrypoint') + 1] === 'npm')
  assert.ok(args.includes('--name') && args[args.indexOf('--name') + 1] === 'jarvis-test')
  assert.ok(args.includes('npm') && args.includes('test'))
  const online = sandboxArgs({ image: 'node:22-bookworm-slim', command: 'npm', args: [], cwd: 'C:\\p', network: 'internet' })
  assert.equal(online[online.indexOf('--network') + 1], 'bridge')
})

test('project commands stay in authorized roots and require approval for every invocation', async () => {
  const calls = []
  const { files, root, directory } = await fixture()
  files.runCommand = async ({ command, args, cwd, network }) => {
    calls.push({ command, args, cwd, network })
    return { exitCode: 0, stdout: 'ok', stderr: '' }
  }
  await assert.rejects(() => files.execute(root.id, '.', 'node', ['--version'], 'none', no), /não autorizado/)
  assert.equal(calls.length, 0)
  const result = await files.execute(root.id, '.', 'node', ['--version'], 'none', yes)
  assert.equal(result.exitCode, 0)
  assert.equal(result.isolated, true)
  assert.deepEqual(calls[0], { command: 'node', args: ['--version'], cwd: directory, network: 'none' })
  let onlineApproval
  await files.execute(root.id, '.', 'npm', ['install'], 'internet', async (details) => {
    onlineApproval = details
    return yes()
  })
  assert.match(onlineApproval.details, /acesso de saída habilitado/)
  assert.equal(calls[1].network, 'internet')
  await assert.rejects(() => files.execute(root.id, '.', 'powershell', ['-Command', '...'], 'none', yes), /não permitido/)
  await assert.rejects(() => files.execute(root.id, '.', 'node', ['--version'], 'internet', async () => ({ approved: true }), AbortSignal.abort()), /aborted|cancelado/i)
  files.runCommand = async () => ({ exitCode: 2, stdout: '', stderr: 'test failed' })
  await assert.rejects(() => files.execute(root.id, '.', 'node', ['--test'], 'none', yes), /código 2.*test failed/s)
})

test('project plans require documentation, tests, and an env example when configuration is used', async () => {
  const { files, root } = await fixture()
  await assert.rejects(() => approvePlan(files, root, 'missing-tests', [
    { file: 'README.md', content: 'docs only' }, { file: 'src/main.py', content: '' },
  ]), /README com instruções e pelo menos um arquivo de teste/)
  const withConfig = [
    { file: 'README.md', content: 'docs' }, { file: 'tests/test_api.py', content: 'test' },
    { file: 'app.py', content: 'pass' }, { file: '.env.example', content: 'PORT=3000' },
  ]
  await assert.rejects(() => approvePlan(files, root, 'configured', withConfig.slice(0, 3), yes, true), /.env.example/)
  const plan = await approvePlan(files, root, 'configured', withConfig, yes, true)
  await assert.rejects(() => files.createProject(plan.planId, withConfig.slice(0, 3), yes), /não correspondem ao plano/)
  const created = await files.createProject(plan.planId, withConfig, yes)
  assert.equal(created.created, true)
  assert.equal((await files.read(root.id, path.join('configured', '.env.example'))).text, 'PORT=3000')
})

test('project undo refuses generated files modified after creation', async () => {
  const { files, root, directory } = await fixture()
  const entries = [
    { file: 'index.js', content: 'original' },
    { file: 'README.md', content: '# API' },
    { file: 'tests/index.test.js', content: 'test' },
  ]
  const plan = await approvePlan(files, root, 'alterado', entries)
  const created = await files.createProject(plan.planId, entries, yes)
  await fs.writeFile(path.join(directory, 'alterado', 'index.js'), 'manual changes')
  await assert.rejects(() => files.undo(created.id, yes), /Arquivo alterado depois/)
  assert.equal(await fs.readFile(path.join(directory, 'alterado', 'index.js'), 'utf8'), 'manual changes')
})

test('project undo preserves untracked files added to the generated folder', async () => {
  const { files, root, directory } = await fixture()
  const entries = [
    { file: 'index.js', content: 'original' },
    { file: 'README.md', content: '# API' },
    { file: 'tests/index.test.js', content: 'test' },
  ]
  const plan = await approvePlan(files, root, 'com-notas', entries)
  const created = await files.createProject(plan.planId, entries, yes)
  await fs.writeFile(path.join(directory, 'com-notas', 'minhas-notas.txt'), 'preservar')
  await assert.rejects(() => files.undo(created.id, yes), /conteúdo não criado/)
  assert.equal(await fs.readFile(path.join(directory, 'com-notas', 'index.js'), 'utf8'), 'original')
  assert.equal(await fs.readFile(path.join(directory, 'com-notas', 'minhas-notas.txt'), 'utf8'), 'preservar')
})
