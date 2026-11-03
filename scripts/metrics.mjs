/**
 * How fast he has been answering, from the numbers each turn records.
 *
 *   npm run metrics                 (the app's data, or this folder's when run from source)
 *   npm run metrics -- caminho.jsonl
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { summariseTurns } from '../bridge/metrics.mjs'

const candidates = [process.argv[2], process.env.JARVIS_DATA_DIR && path.join(process.env.JARVIS_DATA_DIR, 'metrics.jsonl'),
  process.env.APPDATA && path.join(process.env.APPDATA, 'jarvis', 'dados', 'metrics.jsonl'), '.jarvis-data/metrics.jsonl'].filter(Boolean)
const file = candidates.find((candidate) => existsSync(candidate))
if (!file) { console.log('Nenhuma medição ainda. Use o JARVIS um pouco e rode de novo.'); process.exit(0) }

const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
const { turns, firstWord, slow, breakdown } = summariseTurns(rows)
const s = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`)
console.log(`${file}\n${turns} turnos. Até a primeira palavra: mediana ${s(firstWord.median)}, 90% em até ${s(firstWord.p90)}.`)
console.log(`Lentos (mais de 6 s): ${slow} (${turns ? Math.round((slow / turns) * 100) : 0}%).`)
if (breakdown) {
  console.log(`Nos ${breakdown.turns} lentos já medidos, em média: ${breakdown.steps} passos, ${breakdown.toolCalls} ferramentas, `
    + `${s(breakdown.modelMs)} no modelo, ${s(breakdown.toolMs)} nas ferramentas, dos quais ${s(breakdown.approvalMs)} esperando sua aprovação; `
    + `${breakdown.inputTokens} tokens de entrada; ${breakdown.deep} usaram o modelo profundo.`)
} else if (slow) console.log('Esses turnos são de antes do detalhamento. Os próximos já dirão onde o tempo foi.')
