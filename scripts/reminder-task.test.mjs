import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createReminderTask, scheduleCommand, REMINDER_ARG } = require('../desktop/reminder-task.cjs')

const decode = (args) => Buffer.from(args.at(-1), 'base64').toString('utf16le')

test('the date and the path travel as environment, never inside the script', () => {
  const exe = "C:\\Users\\o'neil\\JARVIS.exe"
  const command = scheduleCommand('2026-11-04T11:30:00.000Z', exe)
  const script = decode(command.args)
  assert.equal(command.env.JARVIS_REMINDER_AT, '2026-11-04T11:30:00.000Z')
  assert.equal(command.env.JARVIS_REMINDER_EXE, exe)
  assert.ok(!script.includes('2026-11-04'))
  assert.ok(!script.includes(exe))
  assert.ok(script.includes(REMINDER_ARG))
  assert.ok(script.includes('StartWhenAvailable'))
})

test('no next reminder removes the task, and a broken date is refused', () => {
  assert.equal(scheduleCommand(null, 'x.exe').env.JARVIS_REMINDER_AT, '')
  assert.ok(decode(scheduleCommand(null, 'x.exe').args).includes('Unregister-ScheduledTask'))
  assert.throws(() => scheduleCommand('amanhã', 'x.exe'))
})

function fakeRun(codes) {
  const calls = []
  const run = (file, args, options) => {
    calls.push(options.env.JARVIS_REMINDER_AT)
    const child = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => child.emit('exit', codes.shift() ?? 0))
    return child
  }
  return { run, calls }
}

test('Windows is only asked again when the next time changes', async () => {
  const { run, calls } = fakeRun([])
  const schedule = createReminderTask({ exe: 'x.exe', run })
  await schedule('2026-11-04T11:30:00.000Z')
  await schedule('2026-11-04T11:30:00.000Z')
  await schedule(null)
  await schedule(undefined)
  assert.deepEqual(calls, ['2026-11-04T11:30:00.000Z', ''])
})

test('a failed attempt is retried on the next poll', async () => {
  const { run, calls } = fakeRun([1, 0])
  const schedule = createReminderTask({ exe: 'x.exe', run })
  await schedule('2026-11-04T11:30:00.000Z')
  await schedule('2026-11-04T11:30:00.000Z')
  assert.equal(calls.length, 2)
})
