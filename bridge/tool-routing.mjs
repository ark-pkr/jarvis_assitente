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

/**
 * The model's own way up to the deep model. `isHardRequest` only knows the words of
 * a hard question, and "vale a pena trocar de faculdade agora?" has none of them.
 * The light model can tell it is out of its depth far better than a regex can.
 */
export const THINK_HARDER = 'pensar_melhor'

export const THINK_HARDER_DECLARATION = {
  name: THINK_HARDER,
  description: 'Passa este pedido para um raciocínio mais profundo. Chame ANTES de responder quando a resposta depender de lógica com vários passos, comparação de opções, decisão importante para o usuário, diagnóstico de um erro ou qualquer coisa em que você não tenha certeza. Não chame para contas nem datas: monte a expressão e use calcular ou datas, que são exatas e mais rápidas. Não chame para conversa, fatos simples ou ações diretas.',
  parametersJsonSchema: { type: 'object', properties: {} },
}

export const PARTIAL_TOOLS_NOTE = `Só parte das ferramentas está carregada neste pedido. Use as que estão disponíveis sempre que servirem. Chame ${OPEN_TOOLS} somente se nenhuma delas fizer o que foi pedido e a resposta exigir uma ação ou um dado que você não tenha. Para perguntas de conhecimento geral e conversa, responda direto. Só use painéis quando o usuário pedir para ver algo.`

/** At or under this, a request may lean on the previous exchange for its topic. */
const FOLLOW_UP_WORDS = 4

const SERVERS = [
  ['jarvis', /\bmostr|\bexib|\bpainel|\bpaineis|\bimagem|\bfoto|\bvideo|\btabela|\bgrafico|\bdesenh|\bgere\b|\bcamera\b/],
  ['jarvis_ui', /interface|\btema\b|\bcores?\b|\bazul\b|\bverde\b|vermelh|\broxo\b|\breator\b|\besfera\b|helios|cinema|\btela cheia\b|\bfundo\b|personalidade|sarcast|ironic|\bhumor|\bpiada|engracad|mais serio|\bformal\b|puxa\w* assunto|iniciativa/],
  ['jarvis_memory', /lembr|memoriz|\bguarde\b|\bprefer|\banot|sabe sobre mim|\besquec|combinamos|conversamos|falamos|decidimos|aquele assunto|\bontem\b/],
  ['jarvis_library', /meus (arquivos|materiais|documentos|textos)|minhas (anotacoes|apostilas|notas)|onde (eu )?(falei|li|vi|anotei)|indexa|\bbiblioteca\b/],
  ['jarvis_projects', /projeto|arquivo|\bpasta|\bcodigo|\bprograma|\bapi\b|\bsite\b|\bapp\b|\bbug\b|\berro\b|docker|\bteste|organiz|desfa[cz]/],
  ['jarvis_desktop', /\babr[aei]\w*|aplicativo|\bprograma|vs ?code|\bexcel\b|powerpoint|\bword\b|calculadora|\bbloco de notas\b/],
  ['jarvis_word', /\bword\b|documento|docx/],
  ['jarvis_lessons', /\bpdf\b|\baula|\bapostila/],
  ['jarvis_assistant', /\bhoje\b|\bo que (eu )?tenho\b|\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\bamanha\b|\bdia\b|lembr|\btarefa|rotina|\bparei\b|continu|\bfoco\b|lento|desempenho|\bcpu\b|\bdisco\b|memoria|\bestudo|flashcard|\bmaterial\b|\btimer\b|cronomet|temporizador|pomodoro|\bminutos?\b/],
  ['jarvis_study', /prova oral|\bprova\b|me test[ae]|me pergunt|me examin|\bquiz\b|simulado|\brevis[ao]|\baula|professor|\bmateria\b/],
  // Sums and calendars go to code, which does not miscount.
  ['jarvis_math', /\bquant[oa]s?|\bcalcul|por cento|%|\bjuros|\bsoma|\bmultiplic|\bdivid|\btroco|\bmedia\b|\bporcentagem|\bdesconto|daqui a|\bdias?\b|\bsemanas?\b|\bmes(es)?\b|\bque dia\b|dia da semana|\bdias uteis/],
  // A recording to hear. It finds the file through the authorized folders, so those come too.
  ['jarvis_listen', /\baudios?\b|\bgravac|\bgravei|\bvideo\b|\bmp3\b|\bmp4\b|\bogg\b|\bopus\b|transcrev|transcric|\bouc[ae]|\bescut[ae]/],
  ['jarvis_tasks', /segundo plano|me avis|enquanto isso|\bpesquis\w* .*\bavis|resultado da pesquisa|terminou a pesquisa|\bo que (voce )?achou\b/],
  // A recommendation names titles, and a title has to be checked against the web.
  ['jarvis_daily', /\blivros?\b|\bfilmes?\b|\bseries?\b|\bautora?\b|\bescritora?\b|\brecomend|\bindica\b|\bsugest|\bsugir|\bleitura\b|\bromance\b|\bfantasia\b|\bficcao\b|clima|\btempo\b|chuva|chove|temperatura|previsao|calor|\bfrio\b|musica|\bfaixa|volume|\bsom\b|\bmudo\b|\bpausa\b|\bpause\b|\btoca|\bspotify|pesquis|notici|\bpreco|cotacao|\bdolar\b|\beuro\b|\bplacar|\bjogo\b|resultado|\bquem ganhou|\bquanto (?:foi|esta|custa)/],
  ['jarvis_calendar', /\bagenda\b|calendario|\bcompromisso|\breuni[ao]|\bevento|\bconsulta\b|\bmarc[aeo]\w*|\bdesmarc|\bo que (eu )?tenho\b|\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\bestou livre\b|\bhorario livre\b/],
  ['jarvis_eyes', /\bcamera\b|\ble (isso|essa|esse)\b|\bleia (isso|essa|esse)\b|essa (folha|pagina|conta|nota|receita|questao)|esse (papel|livro|exercicio|boleto|recibo|cupom)|\bolh[ae]|\bveja\b|\bvendo\b|\btela\b|esse erro|essa janela|segurando/],
  ['jarvis_chrome', /pesquis|procur|\bbusc|notici|\batual|\bagora\b|\bhoje\b|\bpreco|cotacao|\bsite\b|navegador|\bgoogle\b|internet|\be-?mail|\bquem e\b|resultado|\bjogo\b/],
]

/**
 * A word problem: quantities that depend on each other ("o dobro do que sobrou", "o
 * triplo da minha idade"). The arithmetic is easy and goes to `calcular`; reading the
 * sentence right is the hard part, and the light model read 5 - 2 + 2*3 as 6.
 */
const WORD_PROBLEM = /\bdobro|\btriplo|\bquadruplo|\bmetade|\bsobr|\brest(a|ou|aram|ante)\b|\bfico\b|\bfiquei\b|\bidade\b|\bcada um\b/
const REASONING = /\bpor que\b|\bcompar[ae]|\banalis|\bplano de\b|\bestrategi|\barquitetura|\balgoritmo|\bprove\b|\bdemonstr|\bdeduz|\bvantagens\b|\bdepur/

/**
 * Whether a wrong answer here would come from thinking too little.
 *
 * Sums and calendar counting used to be in here, because the light model said
 * 1.201 for a sum whose answer is 1.210. They go to `calcular` and `datas` now,
 * which do not miscount, and sending them to the deep model as well only made a
 * compound-interest question take 24 s instead of 4. What is left is reasoning.
 */
export function isHardRequest({ content = '' } = {}) {
  const text = plain(content)
  return REASONING.test(text) || (WORD_PROBLEM.test(text) && /\d/.test(text))
}

/**
 * The servers a request needs, or null for all of them.
 *
 * Only quick questions in the assistant mode are narrowed. The other modes and
 * anything that asked for depth work across many tools by nature, and there a
 * second or two is a fair price.
 */
export function routeTools({ content = '', context = [], mode, fast = false, article = false, windowContext = '', studying = false } = {}) {
  if (!fast || article || (mode && mode !== 'assistente')) return null
  const matching = (text) => new Set(SERVERS.filter(([, words]) => words.test(plain(text))).map(([server]) => server))
  const own = matching(content)
  if (windowContext) own.add('jarvis_eyes')
  // A recording is found through the authorized folders.
  if (own.has('jarvis_listen')) own.add('jarvis_projects')
  // In an exam, "é o tcp" names no tool and still has to reach the one that grades it.
  if (studying) own.add('jarvis_study')
  // Only a bare "sim" or "continue" takes its meaning from what came before.
  // Reading the last exchange every time would pile up the tools of topics the
  // conversation has already left.
  if (own.size || content.trim().split(/\s+/).length > FOLLOW_UP_WORDS || !Array.isArray(context)) return own
  return matching(context.slice(-2).map((entry) => entry.text).join(' '))
}
