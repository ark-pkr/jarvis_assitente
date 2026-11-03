import test from 'node:test'
import assert from 'node:assert/strict'
import { createOriginPolicy, corsFor } from './origins.mjs'

test('only local dev servers are let in by default', () => {
  const { originAllowed } = createOriginPolicy({})
  assert.equal(originAllowed('http://localhost:5173'), true)
  assert.equal(originAllowed('http://127.0.0.1:4173'), true)
  assert.equal(originAllowed('http://[::1]:5199'), true)
  assert.equal(originAllowed('http://localhost:3000'), false, 'another app on localhost')
  assert.equal(originAllowed('https://localhost:5173'), false, 'https is not what the dev server speaks')
  assert.equal(originAllowed('http://evil.example:5173'), false)
  assert.equal(originAllowed('http://localhost.evil.example:5173'), false)
  assert.equal(originAllowed('null'), false, 'sandboxed iframes and file:// pages')
  assert.equal(originAllowed('not a url'), false)
})

test('a missing origin is refused unless asked for', () => {
  assert.equal(createOriginPolicy({}).originAllowed(undefined), false)
  assert.equal(createOriginPolicy({ JARVIS_ALLOW_NO_ORIGIN: '1' }).originAllowed(''), true)
})

test('extra origins are matched exactly, trailing slash or not', () => {
  const { originAllowed, describe } = createOriginPolicy({ JARVIS_ALLOWED_ORIGINS: ' http://127.0.0.1:18787/ , https://jarvis.local ' })
  assert.equal(originAllowed('http://127.0.0.1:18787'), true)
  assert.equal(originAllowed('https://jarvis.local/'), true)
  assert.equal(originAllowed('http://127.0.0.1:18788'), false)
  assert.match(describe(), /18787/)
})

test('CORS reflects the origin instead of opening it to everyone', () => {
  assert.deepEqual(corsFor({ headers: {} }), { vary: 'origin' })
  const headers = corsFor({ headers: { origin: 'http://localhost:5173' } })
  assert.equal(headers['access-control-allow-origin'], 'http://localhost:5173')
  assert.notEqual(headers['access-control-allow-origin'], '*')
})
