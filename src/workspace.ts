import { create } from 'zustand'
import type { Turn } from './store'

export type Conversation = { id: string; title: string; updated: number; turns: Turn[] }
export type HeliosSettings = { paused: boolean; speed: number; glow: number; separation: number; color: 'gold' | 'cyan' | 'violet' | 'emerald' | 'rose'; quality: 'auto' | 'eco' | 'balanced' | 'ultra'; bloom: boolean; autoRotate: boolean; introOnStartup: boolean; cinema: boolean; introSequence: number }
export type Personality = 'formal' | 'equilibrado' | 'bem-humorado' | 'sarcastico'
export type Settings = { liveCamera: boolean; reactiveStars: boolean; orbitingPlanets: boolean; uiSounds: boolean; initiative: boolean; bargeIn: boolean; followUp: boolean; personality: Personality; learn: boolean; windowContext: boolean; inputDeviceId: string; music: number; voiceVolume: number; voiceRate: number; fast: boolean; remember: boolean; lightVisuals: boolean; holoCore: boolean; visualTheme: 'sphere' | 'reactor' | 'helios'; helios: HeliosSettings; speechPause: number; experienceVersion: number; naturalVoice: boolean; neuralVoice: string; newsTopics: string; voiceIdentityRequired: boolean; speakerThreshold: number; mode: 'assistente' | 'desenvolvimento' | 'analise' | 'tutor'; activityProfile: 'pessoal' | 'trabalho' | 'estudo' | 'descanso'; privacyMode: boolean; sidePanelsVisible: boolean; bootSeen: boolean; fullBoot: boolean; greeting: boolean; briefingDay: string; city: string }
type SettingsPatch = Partial<Omit<Settings, 'helios'>> & { helios?: Partial<HeliosSettings> }
export type Learning = { level: string; minutes: number; topic: string; goal: string; completed: string[]; pdfFolder: string; pdfFile: string; pdfTopic: string; pageFrom: number; pageTo: number; exampleTarget: 'word' | 'vscode'; exampleFolder: string; exampleFile: string }
const learningDefaults: Learning = { level: 'Iniciante', minutes: 30, topic: 'logica', goal: '', completed: [], pdfFolder: '', pdfFile: '', pdfTopic: '', pageFrom: 1, pageTo: 3, exampleTarget: 'word', exampleFolder: '', exampleFile: 'aula-exemplo.py' }
const key = 'jarvis.workspace.v1'
/** The floating orb shares this origin's storage but none of its state. */
const mirrorWindow = new URLSearchParams(location.search).has('mini')
const fresh = (): Conversation => ({ id: crypto.randomUUID(), title: 'Nova conversa', updated: Date.now(), turns: [] })
const initial = fresh()
const defaults: Settings = { liveCamera: true, reactiveStars: true, orbitingPlanets: true, uiSounds: true, initiative: true, bargeIn: false, followUp: false, personality: 'equilibrado', learn: true, windowContext: false, inputDeviceId: '', music: .04, voiceVolume: 1, voiceRate: 1.25, fast: true, remember: true, lightVisuals: true, holoCore: true, visualTheme: 'sphere', helios: { paused: false, speed: 1, glow: 1, separation: 0, color: 'gold', quality: 'auto', bloom: true, autoRotate: true, introOnStartup: true, cinema: false, introSequence: 0 }, speechPause: .8, experienceVersion: 9, naturalVoice: true, neuralVoice: 'Charon', newsTopics: '', voiceIdentityRequired: false, speakerThreshold: .72, mode: 'assistente', activityProfile: 'pessoal', privacyMode: false, sidePanelsVisible: false, bootSeen: false, fullBoot: false, greeting: true, briefingDay: '', city: '' }
let saved: { sessions?: Conversation[]; active?: string; memory?: string; settings?: Settings; learning?: Learning } = {}
try { saved = JSON.parse(localStorage.getItem(key) || '{}') } catch { /* recover with empty workspace */ }
// Apply the requested clearer audio and balanced reasoning once, preserving later adjustments.
if (saved.settings && (saved.settings.experienceVersion || 0) < 2) saved.settings = { ...saved.settings,
  music: .04, voiceVolume: 1, voiceRate: 1, fast: false, lightVisuals: true, speechPause: 1.2, experienceVersion: 2 }
if (saved.settings && (saved.settings.experienceVersion || 0) < 3) saved.settings = { ...saved.settings,
  naturalVoice: true, neuralVoice: 'Charon', voiceRate: 1, experienceVersion: 3 }
if (saved.settings && (saved.settings.experienceVersion || 0) < 4) saved.settings = { ...saved.settings, voiceRate: 1.08, experienceVersion: 4 }
if (saved.settings && (saved.settings.experienceVersion || 0) < 5) saved.settings = { ...saved.settings, speechPause: Math.max(1.5, saved.settings.speechPause || 0), experienceVersion: 5 }
if (saved.settings && (saved.settings.experienceVersion || 0) < 6) saved.settings = {
  ...saved.settings,
  voiceRate: saved.settings.voiceRate === 1.08 ? 1.25 : saved.settings.voiceRate,
  experienceVersion: 6,
}
if (saved.settings && (saved.settings.experienceVersion || 0) < 7) saved.settings = {
  ...saved.settings,
  fast: saved.settings.fast === false ? true : saved.settings.fast,
  speechPause: saved.settings.speechPause === 1.5 ? .8 : saved.settings.speechPause,
  newsTopics: typeof saved.settings.newsTopics === 'string' ? saved.settings.newsTopics : '',
  experienceVersion: 7,
}
if (saved.settings && (saved.settings.experienceVersion || 0) < 8) saved.settings = {
  ...saved.settings,
  voiceIdentityRequired: false,
  speakerThreshold: .72,
  experienceVersion: 8,
}
if (saved.settings && (saved.settings.experienceVersion || 0) < 9) saved.settings = {
  ...saved.settings,
  fast: typeof saved.settings.fast === 'boolean' ? saved.settings.fast : true,
  experienceVersion: 9,
}
const sessions = Array.isArray(saved.sessions) && saved.sessions.length ? saved.sessions : [initial]

type Workspace = {
  sessions: Conversation[]; active: string; memory: string; settings: Settings; storageError: string
  learning: Learning
  setLearning: (values: Partial<Learning>) => void
  saveTurns: (turns: Turn[]) => void
  newSession: () => Conversation
  select: (id: string) => void
  remove: (id: string) => void
  clear: () => void
  setMemory: (memory: string) => void
  setSettings: (settings: SettingsPatch) => void
}

export const useWorkspace = create<Workspace>((set, get) => ({
  sessions, active: sessions.some((s) => s.id === saved.active) ? saved.active! : sessions[0].id,
  memory: typeof saved.memory === 'string' ? saved.memory : '', settings: { ...defaults, ...saved.settings, helios: { ...defaults.helios, ...saved.settings?.helios } }, storageError: '',
  learning: { ...learningDefaults, ...saved.learning },
  setLearning: (values) => set((state) => ({ learning: { ...state.learning, ...values } })),
  saveTurns: (turns) => set((state) => ({ sessions: state.sessions.map((s) => s.id === state.active ? {
    ...s, turns, updated: Date.now(), title: turns.find((t) => t.role === 'user')?.text.slice(0, 70) || 'Nova conversa',
  } : s) })),
  newSession: () => { const session = fresh(); set((state) => ({ sessions: [session, ...state.sessions], active: session.id })); return session },
  select: (active) => { if (get().sessions.some((s) => s.id === active)) set({ active }) },
  remove: (id) => {
    const remaining = get().sessions.filter((s) => s.id !== id)
    if (!remaining.length) remaining.push(fresh())
    set({ sessions: remaining, active: get().active === id ? remaining[0].id : get().active })
  },
  clear: () => { const session = fresh(); set({ sessions: [session], active: session.id, memory: '', learning: { ...learningDefaults, completed: [] } }) },
  setMemory: (memory) => set({ memory: memory.slice(0, 6000) }),
  setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings, helios: { ...state.settings.helios, ...settings.helios } } })),
}))

// Persistence is debounced so streamed tokens do not block rendering.
let timer: ReturnType<typeof setTimeout> | undefined
let replaced = false
export function flushWorkspace() {
  clearTimeout(timer)
  // Its snapshot went stale the moment it loaded, and writing it back would
  // overwrite everything the main window saved since.
  if (mirrorWindow || replaced) return
  const { sessions, active, memory, settings, learning } = useWorkspace.getState()
  if (settings.privacyMode) return
  try {
    localStorage.setItem(key, JSON.stringify({ sessions: settings.remember ? sessions : [], active, memory: settings.remember ? memory : '', settings, learning: settings.remember ? learning : undefined }))
    if (useWorkspace.getState().storageError) useWorkspace.setState({ storageError: '' })
  } catch {
    if (!useWorkspace.getState().storageError) useWorkspace.setState({ storageError: 'Armazenamento cheio ou indisponível. Exporte suas conversas para não perdê-las.' })
  }
}
useWorkspace.subscribe(() => { clearTimeout(timer); timer = setTimeout(flushWorkspace, 350) })
window.addEventListener('pagehide', flushWorkspace)

/** Null in the floating orb, which has no say over this storage. */
export function workspaceSnapshot() {
  if (mirrorWindow) return null
  flushWorkspace()
  return localStorage.getItem(key)
}
/** Takes effect on the reload that must follow; until then nothing may write the old state back. */
export function replaceWorkspace(raw: string | null) {
  replaced = true
  if (raw) localStorage.setItem(key, raw)
  else localStorage.removeItem(key)
}

export function conversationContext() {
  const state = useWorkspace.getState()
  const modes = {
    assistente: 'Ajude com tarefas gerais, arquivos e estudos conforme o pedido.',
    desenvolvimento: 'Atue como parceiro de desenvolvimento: leia código somente em pastas autorizadas, explique erros, proponha mudanças pequenas e testes. Mostre código e alterações propostas em painéis legíveis com antes/depois. Nunca diga que executou código ou testes sem ferramenta que comprove. Use project_write com confirmação para editar. Não reorganize arquivos de código automaticamente.',
    analise: 'Atue como analista de sistemas: esclareça requisitos e pressupostos, identifique atores, fluxos, regras de negócio, requisitos não funcionais e critérios de aceite. Proponha modelo de dados, entidades e arquitetura proporcional. Apresente detalhes no painel, mantenha a fala curta.',
    tutor: 'Atue como professor particular, adaptando a linguagem ao nível do aluno. Ensine um conceito por vez; use uma analogia curta quando ajudar, dê um exemplo concreto e explique o raciocínio. Em código, mostre uma versão legível e comentada quando fizer sentido, diga o resultado esperado e percorra cada parte sem apenas entregar uma solução. Em tabelas, explique títulos, unidades, linhas relevantes e relações entre valores. Ao usar um PDF, cite a página junto de cada ideia baseada nele, separe o conteúdo da fonte dos exemplos criados e peça a imagem da página para tabelas, fórmulas, diagramas, colunas ou extração confusa; se algo estiver ilegível ou ambíguo, admita em vez de adivinhar. Em aula expositiva, explique diretamente e não interrompa cada etapa com perguntas; ao final, ofereça um exercício opcional sem resposta. Se o aluno aceitar ou pedir prática, dê uma pista por vez, espere a tentativa e só revele a solução completa se for solicitado. Não marque domínio só por ter mostrado a resposta.',
  }
  const activityProfiles = {
    pessoal: 'Equilibre tarefas pessoais e respostas diretas.',
    trabalho: 'Priorize organização profissional, próximos passos e comunicação clara.',
    estudo: 'Priorize aprendizagem ativa, explicações adaptadas e revisão espaçada.',
    descanso: 'Use tom tranquilo e só proponha tarefas quando o usuário pedir.',
  }
  const city = state.settings.city.trim() ? `\nCidade padrão para o clima: ${state.settings.city.trim()}.` : ''
  const profile = `Modo solicitado: ${state.settings.mode}. ${modes[state.settings.mode] || modes.assistente}\nPerfil de atividade: ${state.settings.activityProfile}. ${activityProfiles[state.settings.activityProfile]}\nEstudos: nível ${state.learning.level}; ${state.learning.minutes} minutos por dia; tema ${state.learning.topic}; objetivo ${state.learning.goal}. Tópicos marcados pelo usuário: ${state.learning.completed.join(', ')}.${city}`
  const privacy = state.settings.privacyMode
    ? 'Modo privacidade ativo: não use memória pessoal nem histórico de conversa. Pedidos digitados ainda usam o serviço de IA configurado. Não pesquise na web a menos que o usuário peça explicitamente.'
    : ''
  return { context: state.settings.privacyMode ? [] : state.sessions.find((s) => s.id === state.active)?.turns.slice(-40) ?? [],
    memory: state.settings.privacyMode ? privacy : [profile, state.settings.remember ? state.memory : ''].filter(Boolean).join('\n').slice(0, 6000),
    fast: state.settings.fast, privacyMode: state.settings.privacyMode, mode: state.settings.mode, learn: state.settings.learn && state.settings.remember, personality: state.settings.personality }
}
