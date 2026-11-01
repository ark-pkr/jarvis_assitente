import { useEffect, useState } from 'react'
import { micLevel } from '../lib/audio'

export function AudioCheck({ onTestVoice }: { onTestVoice: () => void }) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setLevel(Math.round(micLevel() * 100)), 150)
    return () => clearInterval(timer)
  }, [])
  return <div className="audio-check">
    <p>Sinal do microfone: <b>{level}%</b>. Fale normalmente para verificar a entrada.</p>
    <progress aria-label="Sinal do microfone" max={100} value={level} />
    <button onClick={onTestVoice}>Ouvir teste de voz</button>
    <p>O volume da voz do navegador vai até 100%. Se continuar baixo, confira o volume do Chrome no mixer do Windows e o dispositivo de saída.</p>
  </div>
}
