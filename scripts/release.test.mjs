import test from 'node:test'
import assert from 'node:assert/strict'
import { latestYml, changelogSection, installerName } from './release.mjs'

test('latest.yml has the shape electron-updater reads', () => {
  const yml = latestYml({ version: '1.11.1', file: installerName('1.11.1'), sha512: 'abc==', size: 42, date: new Date('2026-11-03T20:00:00Z') })
  assert.equal(yml, [
    'version: 1.11.1',
    'files:',
    '  - url: JARVIS-Setup-1.11.1-x64.exe',
    '    sha512: abc==',
    '    size: 42',
    'path: JARVIS-Setup-1.11.1-x64.exe',
    'sha512: abc==',
    "releaseDate: '2026-11-03T20:00:00.000Z'",
    '',
  ].join('\n'))
})

test('the release notes are just this version from the changelog', () => {
  const changelog = '# Histórico\n\n## 1.11.1\n\n- Conserto.\n\n## 1.11.0\n\n- Antigo.\n'
  assert.equal(changelogSection(changelog, '1.11.1'), '- Conserto.')
  assert.equal(changelogSection(changelog, '1.11.0'), '- Antigo.')
  assert.equal(changelogSection(changelog, '9.9.9'), '')
})
