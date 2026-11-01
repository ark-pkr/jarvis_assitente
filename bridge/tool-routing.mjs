import { plain } from './prompt.mjs'

/**
 * Which tools a request carries.
 *
 * Every declaration goes out on every step, and all of them together are about
 * thirty thousand tokens. Measured on the same question: 3.5 s to the first word
 * with all of them, 0.9 s with none. So a request carries only the servers its
 * words call for, read the same way the prompt picks its topics.
 *
 * Words can miss, so nothing here may cost a capability: every partial set also
 * carries `abrir_ferramentas`, which brings the full set in for the next step.
 * A miss costs one extra step, never a request JARVIS refuses.
 */

export const OPEN_TOOLS = 'abrir_ferramentas'

export const OPEN_TOOLS_DECLARATION = {
  name: OPEN_TOOLS,
  description: 'Carrega todas as ferramentas do JARVIS. Chame antes de responder sempre que o pedido envolver qualquer ação, consulta local, painel, página, arquivo, aplicativo, lembrete, pesquisa ou dado atual que você não tenha agora. Nunca diga que não consegue fazer algo sem chamar isto primeiro.',
  parametersJsonSchema: { type: 'object', properties: {} },
}

export const PARTIAL_TOOLS_NOTE = `Só parte das ferramentas está carregada neste pedido. Use as que estão disponíveis sempre que servirem. Chame ${OPEN_TOOLS} somente se nenhuma delas fizer o que foi pedido e a resposta exigir uma ação ou um dado que você não tenha. Para perguntas de conhecimento geral e conversa, responda direto. Só use painéis quando o usuário pedir para ver algo.`

/** At or under this, a request may lean on the previous exchange for its topic. */
const FOLLOW_UP_WORDS = 4

const SERVERS = [
  ['jarvis', /\bmostr|\bexib|\bpainel|\bpaineis|\bimagem|\bfoto|\bvideo|\btabela|\bgrafico|\bdesenh|\bgere\b|\bcamera\b/],
  ['jarvis_ui', /interface|\btema\b|\bcores?\b|\bazul\b|\bverde\b|vermelh|\broxo\b|\breator\b|\besfera\b|helios|cinema|\btela cheia\b|\bfundo\b/],
  ['jarvis_memory', /lembr|memoriz|\bguarde\b|\bprefer|\banot/],
  ['jarvis_projects', /projeto|arquivo|\bpasta|\bcodigo|\bprograma|\bapi\b|\bsite\b|\bapp\b|\bbug\b|\berro\b|docker|\bteste|organiz|desfa[cz]/],
  ['jarvis_desktop', /\babr[aei]\w*|aplicativo|\bprograma|vs ?code|\bexcel\b|powerpoint|\bword\b|calculadora|\bbloco de notas\b/],
  ['jarvis_word', /\bword\b|documento|docx/],
  ['jarvis_lessons', /\bpdf\b|\baula|\bapostila/],
  ['jarvis_assistant', /\bhoje\b|\bamanha\b|\bdia\b|lembr|\btarefa|rotina|\bparei\b|continu|\bfoco\b|lento|desempenho|\bcpu\b|\bdisco\b|memoria|\bestudo|flashcard|\bmaterial\b/],
  ['jarvis_daily', /clima|\btempo\b|chuva|chove|temperatura|previsao|calor|\bfrio\b|musica|\bfaixa|volume|\bsom\b|\bmudo\b|\bpausa\b|\bpause\b|\btoca|\bspotify/],
  ['jarvis_eyes', /\bcamera\b|\bolh[ae]|\bveja\b|\bvendo\b|\btela\b|esse erro|essa janela|segurando/],
  ['jarvis_chrome', /pesquis|procur|\bbusc|notici|\batual|\bagora\b|\bhoje\b|\bpreco|cotacao|\bsite\b|navegador|\bgoogle\b|internet|\be-?mail|\bquem e\b|resultado|\bjogo\b/],
]

/**
 * The servers a request needs, or null for all of them.
 *
 * Only quick questions in the assistant mode are narrowed. The other modes and
 * anything that asked for depth work across many tools by nature, and there a
 * second or two is a fair price.
 */
export function routeTools({ content = '', context = [], mode, fast = false, article = false } = {}) {
  if (!fast || article || (mode && mode !== 'assistente')) return null
  const matching = (text) => new Set(SERVERS.filter(([, words]) => words.test(plain(text))).map(([server]) => server))
  const own = matching(content)
  // Only a bare "sim" or "continue" takes its meaning from what came before.
  // Reading the last exchange every time would pile up the tools of topics the
  // conversation has already left.
  if (own.size || content.trim().split(/\s+/).length > FOLLOW_UP_WORDS || !Array.isArray(context)) return own
  return matching(context.slice(-2).map((entry) => entry.text).join(' '))
}
