import { create } from 'zustand'

/** Not a setting: the next start should open on the normal screen, whatever this one ended on. */
export const useCinema = create<{ on: boolean }>(() => ({ on: false }))

export function setCinema(on: boolean) {
  useCinema.setState({ on })
  if (on) (document.activeElement as HTMLElement | null)?.blur?.()
  if (window.jarvisDesktop) void window.jarvisDesktop.setFullScreen(on)
  else if (on) void document.documentElement.requestFullscreen?.().catch(() => { /* A voice command is no gesture, and the screen still clears. */ })
  else if (document.fullscreenElement) void document.exitFullscreen()
}
