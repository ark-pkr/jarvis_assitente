import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dataPath } from './paths.mjs'

const MAX_BYTES = 1024 * 1024

/**
 * Prices are not in the code because they change and differ by model. Set
 * JARVIS_PRICE_INPUT and JARVIS_PRICE_OUTPUT, in USD per million tokens, to get
 * a cost per turn; without them the cost stays null rather than a guess.
 */
export function turnCost({ inputTokens = 0, outputTokens = 0, thoughtTokens = 0 }, env = process.env) {
  const input = Number(env.JARVIS_PRICE_INPUT)
  const output = Number(env.JARVIS_PRICE_OUTPUT)
  if (!(input > 0) || !(output > 0)) return null
  return (inputTokens * input + (outputTokens + thoughtTokens) * output) / 1_000_000
}

/** Numbers only. Nothing the user said or the model answered is ever written. */
export async function recordTurn(usage, file = dataPath('metrics.jsonl')) {
  console.log(`[jarvis] turno: primeira resposta ${usage.firstTextMs ?? '-'} ms, total ${usage.totalMs} ms `
    + `(${usage.steps ?? '-'} passos, modelo ${usage.modelMs ?? '-'} ms, ferramentas ${usage.toolMs ?? '-'} ms, aprovação ${usage.approvalMs ?? '-'} ms), `
    + `tokens ${usage.inputTokens} entrada, ${usage.cachedTokens} em cache, ${usage.outputTokens} saída, ${usage.thoughtTokens} raciocínio`
    + (usage.deep ? `, modelo forte (${usage.deepReason ?? 'sem motivo anotado'})` : ''))
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const size = await fs.stat(file).then((info) => info.size, () => 0)
    if (size > MAX_BYTES) await fs.rename(file, `${file}.1`)
    await fs.appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...usage }) + '\n')
  } catch (error) {
    console.warn(`[jarvis] metrics: ${error.message}`)
  }
}

const SLOW_MS = 6000
const quantile = (values, share) => {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : null
}
const mean = (rows, key) => {
  const values = rows.map((row) => row[key]).filter((value) => typeof value === 'number')
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

/**
 * What the recorded turns say about speed: how long to the first word, and for the
 * slow ones, where the time went. Turns from before steps were recorded count for
 * speed but not for the breakdown.
 */
export function summariseTurns(rows) {
  const turns = rows.filter((row) => typeof row.totalMs === 'number')
  const firstWord = turns.map((row) => row.firstTextMs ?? row.totalMs)
  const slow = turns.filter((row) => (row.firstTextMs ?? row.totalMs) > SLOW_MS)
  const measured = slow.filter((row) => typeof row.steps === 'number')
  return {
    turns: turns.length,
    firstWord: { median: quantile(firstWord, 0.5), p90: quantile(firstWord, 0.9) },
    slow: slow.length,
    breakdown: measured.length ? {
      turns: measured.length,
      steps: mean(measured, 'steps'), toolCalls: mean(measured, 'toolCalls'),
      modelMs: mean(measured, 'modelMs'), toolMs: mean(measured, 'toolMs'), approvalMs: mean(measured, 'approvalMs'),
      inputTokens: mean(measured, 'inputTokens'), deep: measured.filter((row) => row.deep).length,
    } : null,
  }
}
