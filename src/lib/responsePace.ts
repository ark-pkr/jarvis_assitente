export type ResponsePace = { fast: boolean; reason: 'explicit-fast' | 'explicit-deep' | 'automatic-fast' | 'automatic-deep' }

const FAST_REQUEST = /\b(?:resposta|modo)\s+(?:bem\s+)?r[aá]pid[ao]\b|\b(?:responda|responder)\s+(?:bem\s+)?r[aá]pid[ao]\b|\b(?:seja|vai)\s+(?:mais\s+)?r[aá]pid[ao]\b/i
const DEEP_REQUEST = /\b(?:investigue|pesquise|analise|explique|compare|aprofunde)\s+(?:isso\s+)?(?:melhor|detalhadamente|a fundo|com mais detalhe)\b|\b(?:modo|resposta)\s+(?:detalhad[ao]|complet[ao]|aprofundad[ao])\b|\b(?:pesquisa|an[aá]lise|compara[cç][aã]o)\s+(?:completa|detalhada|profunda)\b/i
const ARTICLE_REQUEST = /\b(?:escrev\w*|redij\w*|produz\w*|cri\w*|elabor\w*|prepar\w*)\b.{0,60}\b(?:artigo|texto|reda[cç][aã]o|ensaio|mat[eé]ria)\b|\b(?:artigo|texto|reda[cç][aã]o|ensaio|mat[eé]ria)\b.{0,60}\b(?:escrev\w*|redij\w*|produz\w*|cri\w*|elabor\w*|prepar\w*)\b/i
const DEEP_TOPICS = /\b(?:pesquise|pesquisa|investigue|investiga|compare|comparar|an[aá]lise|analise|detalhad[oa]s?|passo a passo|fontes|atualizado|diverg[eê]ncias|vantagens e desvantagens|plano completo|arquitetura|diagn[oó]stico|artigo|reda[cç][aã]o|ensaio)\b/i

export function isArticleRequest(text: string): boolean {
  return ARTICLE_REQUEST.test(text)
}

export function chooseResponsePace(text: string, defaultFast = true): ResponsePace {
  if (isArticleRequest(text)) return { fast: false, reason: 'automatic-deep' }
  if (FAST_REQUEST.test(text)) return { fast: true, reason: 'explicit-fast' }
  if (DEEP_REQUEST.test(text)) return { fast: false, reason: 'explicit-deep' }

  const deep = DEEP_TOPICS.test(text)
    || text.length > 180
    || (text.match(/\?/g)?.length ?? 0) > 1
  if (deep) return { fast: false, reason: 'automatic-deep' }
  return { fast: defaultFast, reason: defaultFast ? 'automatic-fast' : 'automatic-deep' }
}
