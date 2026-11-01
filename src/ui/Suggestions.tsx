import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'

/**
 * Rotating example commands, shown only while idle.
 *
 * A voice interface has no menus — nothing tells you what it can do. This is
 * the affordance. It disappears the moment JARVIS is doing anything, so it
 * never competes with the answer.
 *
 * Each line is phrased the way you'd actually say it, not as a feature name.
 */
const EXAMPLES = [
  'como está o clima hoje?',
  'pausa a música',
  'coloca o volume em trinta por cento',
  'olha minha tela, que erro é esse?',
  'começar meu dia',
  'onde eu parei?',
  'deixe a interface azul',
  'o que você consegue fazer?',
]

const ROTATE_MS = 4200

export function Suggestions() {
  const phase = useStore((s) => s.phase)
  const turns = useStore((s) => s.turns)
  const [i, setI] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  // Only while genuinely idle, and only until the first exchange — once the
  // user knows how it works, the prompt is just clutter. Listening counts as
  // idle: the app comes up listening, so a dormant-only rule meant this strip
  // appeared only after someone pressed Escape on an empty conversation.
  if (!['dormant', 'listening'].includes(phase) || turns.length > 0) return null

  return (
    <div className="suggest">
      <span className="suggest-lead">experimente</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          className="suggest-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35 }}
        >
          “Oi Jarvis, {EXAMPLES[i]}”
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
