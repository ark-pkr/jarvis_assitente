import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { serveLiveTranscription } from './live-transcribe.mjs'

const fakeSocket = () => Object.assign(new EventEmitter(), {
  OPEN: 1, readyState: 1, answers: [], closed: false,
  send(text) { this.answers.push(JSON.parse(text)) },
  close() { this.closed = true; this.readyState = 3 },
})
/** A Gemini session that records what it was sent and speaks when told to. */
const fakeGemini = () => {
  const gemini = { audio: [], ended: false, closed: false, callbacks: null, opened: null }
  gemini.connect = async (callbacks) => {
    gemini.callbacks = callbacks
    if (gemini.opened) await gemini.opened
    return {
      sendRealtimeInput(input) {
        if (input.audio) gemini.audio.push(input.audio.data)
        if (input.audioStreamEnd) gemini.ended = true
      },
      close() { gemini.closed = true },
    }
  }
  gemini.final = (text) => gemini.callbacks.onmessage({ serverContent: { inputTranscription: { text } } })
  gemini.complete = () => gemini.callbacks.onmessage({ serverContent: { generationComplete: true } })
  gemini.activity = (type) => gemini.callbacks.onmessage({ voiceActivity: { type } })
  return gemini
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const frame = Buffer.from([1, 2, 3, 4])
const setup = async (options) => {
  const socket = fakeSocket()
  const gemini = fakeGemini()
  serveLiveTranscription(socket, { connect: gemini.connect, ...options })
  await tick()
  return { socket, gemini }
}

test('the final transcript answers as soon as the model says it is done', async () => {
  const { socket, gemini } = await setup()
  socket.emit('message', frame, true)
  socket.emit('message', 'end', false)
  assert.equal(gemini.ended, true)
  assert.deepEqual(gemini.audio, [frame.toString('base64')])
  gemini.final('Qual é a capital do Chile?')
  assert.deepEqual(socket.answers, [], 'more of the same sentence may still follow')
  gemini.complete()
  assert.deepEqual(socket.answers, [{ text: 'Qual é a capital do Chile?' }])
  assert.equal(socket.closed, true)
  assert.equal(gemini.closed, true)
})

test('audio said while the session is connecting is not lost, nor is the end of it', async () => {
  const socket = fakeSocket()
  const gemini = fakeGemini()
  let open
  gemini.opened = new Promise((resolve) => { open = resolve })
  serveLiveTranscription(socket, { connect: gemini.connect })
  await tick()
  socket.emit('message', frame, true)
  socket.emit('message', 'end', false)
  assert.equal(gemini.ended, false)
  open()
  await tick()
  assert.equal(gemini.audio.length, 1)
  assert.equal(gemini.ended, true)
})

test('a pause mid-sentence does not end the turn', async () => {
  const { socket, gemini } = await setup()
  gemini.activity('ACTIVITY_START')
  gemini.final('Abra o Word')
  gemini.complete()
  gemini.activity('ACTIVITY_END')
  gemini.activity('ACTIVITY_START')
  assert.deepEqual(socket.answers, [])
  socket.emit('message', 'end', false)
  assert.deepEqual(socket.answers, [], 'the speaker came back, so more is on its way')
  gemini.final('e crie um documento.')
  gemini.complete()
  assert.deepEqual(socket.answers, [{ text: 'Abra o Word e crie um documento.' }])
})

test('an utterance the model already closed answers without waiting', async () => {
  const { socket, gemini } = await setup()
  gemini.activity('ACTIVITY_START')
  gemini.final('Pausa a música.')
  gemini.complete()
  gemini.activity('ACTIVITY_END')
  socket.emit('message', 'end', false)
  assert.deepEqual(socket.answers, [{ text: 'Pausa a música.' }])
})

test('nothing back in time hands the audio to the ordinary transcriber', async () => {
  const { socket } = await setup({ answerMs: 5 })
  socket.emit('message', 'end', false)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(socket.answers, [{ fallback: true }])
})

test('a stalled session with words already in hand answers with those words', async () => {
  const { socket, gemini } = await setup({ answerMs: 5 })
  gemini.activity('ACTIVITY_START')
  gemini.final('Abra o Word')
  socket.emit('message', 'end', false)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(socket.answers, [{ text: 'Abra o Word' }])
})

test('a session that fails to open, errors or drops asks for the fallback', async () => {
  const refused = fakeSocket()
  serveLiveTranscription(refused, { connect: async () => { throw new Error('recusada') } })
  await tick()
  assert.deepEqual(refused.answers, [{ fallback: true }])

  const failing = await setup()
  failing.gemini.callbacks.onerror(new Error('x'))
  assert.deepEqual(failing.socket.answers, [{ fallback: true }])

  const dropped = await setup()
  dropped.gemini.callbacks.onclose({ code: 1011 })
  assert.deepEqual(dropped.socket.answers, [{ fallback: true }])
})

test('noise transcribed as a label is no words at all', async () => {
  const { socket, gemini } = await setup()
  socket.emit('message', 'end', false)
  gemini.final('[música]')
  gemini.complete()
  assert.deepEqual(socket.answers, [{ text: '' }])
})

test('the app walking away closes the session and answers nobody', async () => {
  const { socket, gemini } = await setup()
  socket.readyState = 3
  socket.emit('close')
  assert.equal(gemini.closed, true)
  assert.deepEqual(socket.answers, [])
})

test('a session that never ends is closed by its limit', async () => {
  const { socket, gemini } = await setup({ limitMs: 5 })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(gemini.closed, true)
  assert.deepEqual(socket.answers, [{ fallback: true }])
})
