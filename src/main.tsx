import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Deliberately no StrictMode: its double-invoked effects would open the
// microphone and arm the wake-word engine twice, and the second subscription
// steals the audio stream from the first.
//
// Imported on demand so the floating orb loads none of the app: no voice loop,
// no audio engine, nothing that could turn into a second assistant.
if (new URLSearchParams(location.search).has('mini')) {
  document.documentElement.dataset.mini = ''
  void import('./ui/MiniOrb').then(({ MiniOrb }) => root.render(<MiniOrb />))
} else {
  void import('./App.tsx').then(({ default: App }) => root.render(<App />))
}
