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
  console.log(`[jarvis] turno: primeira resposta ${usage.firstTextMs ?? '-'} ms, total ${usage.totalMs} ms, `
    + `tokens ${usage.inputTokens} entrada, ${usage.cachedTokens} em cache, ${usage.outputTokens} saída, ${usage.thoughtTokens} raciocínio`)
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const size = await fs.stat(file).then((info) => info.size, () => 0)
    if (size > MAX_BYTES) await fs.rename(file, `${file}.1`)
    await fs.appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...usage }) + '\n')
  } catch (error) {
    console.warn(`[jarvis] metrics: ${error.message}`)
  }
}
