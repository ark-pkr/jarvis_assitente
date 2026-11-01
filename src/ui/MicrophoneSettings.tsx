import { useEffect, useState } from 'react'
import { useWorkspace, flushWorkspace } from '../workspace'
export function MicrophoneSettings() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const workspace = useWorkspace()
  const [selected, setSelected] = useState(workspace.settings.inputDeviceId)
  useEffect(() => { void navigator.mediaDevices.enumerateDevices().then((items) => setDevices(items.filter((item) => item.kind === 'audioinput'))).catch(() => {}) }, [])
  return <>
    <label>Microfone de entrada<select aria-label="Microfone de entrada" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Padrão do Windows</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>
    <button onClick={() => { workspace.setSettings({ inputDeviceId: selected }); flushWorkspace(); window.location.reload() }}>Aplicar microfone e reiniciar escuta</button>
    <p>Diga “Jarvis” ou pressione Espaço para iniciar. Com a proteção de voz ativa, comandos falados só são transcritos após o reconhecimento local do perfil cadastrado; Espaço oferece ativação manual para um pedido. As confirmações aparecem quando uma ferramenta precisa abrir aplicativos ou alterar dados.</p>
  </>
}
