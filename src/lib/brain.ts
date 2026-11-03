import { conversationContext } from '../workspace'
import * as bridge from './bridge'
import type { AskHandlers } from './bridge'
import type { Blade, Panel } from '../store'

export type { AskHandlers }
export type { ConnectionState } from './bridge'

/**
 * The brain. A local Node process (bridge/server.mjs) holds the model, the
 * tools and the conversation state; the interface talks to it over one
 * WebSocket. There used to be a second, browser-direct path that called the
 * Claude API from the page itself, which put the API key in the bundle. It is
 * gone: every key now stays on the bridge side.
 */

/** Conversation state lives in the bridge session, so no history is passed. */
export async function ask(
  prompt: string,
  handlers: AskHandlers,
  request: { fast: boolean; article: boolean },
): Promise<{ text: string; tools: string[] }> {
  const context = conversationContext()
  return bridge.ask(prompt, handlers, { ...request, privacyMode: context.privacyMode })
}

export async function warm(): Promise<void> {
  await bridge.warmBridge()
}

/** The bridge reports its server list twice — from config on connect, then
 *  with live status once the agent boots — so the HUD subscribes. */
export function watchServers(fn: (servers: string[]) => void): void {
  bridge.watchServers(fn)
}

/** HUD panels are pushed mid-turn by the `display` tool, not returned by ask(). */
export function watchPanels(fn: (panel: Panel) => void): void {
  bridge.watchPanels(fn)
}

/** Blades — the big surface — arrive the same way, from the `blade` tool. */
export function watchBlades(fn: (blade: Blade) => void): void {
  bridge.watchBlades(fn)
}

/**
 * Redressing the interface — theme, reactor, orbiting objects, effects. The
 * `ui_*` tools live in an in-process MCP server inside the bridge and push
 * straight down the open socket, mid-turn.
 */
export function watchUi(fn: (op: string, args: any) => void): void {
  bridge.watchUi(fn)
}

/**
 * The one thing the bridge asks US for: a camera frame. The hardware is in the
 * browser and the model is in the bridge, so this handler answers a request
 * rather than receiving a push.
 */
export function watchCapture(
  fn: (req: bridge.CaptureRequest) => Promise<bridge.CaptureResult>,
): void {
  bridge.watchCapture(fn)
}

/**
 * Barge-in. Interrupts the agent and settles whatever `ask()` call is
 * outstanding with the text so far, so the caller's await always returns.
 */
export function cancel(): void {
  bridge.cancel()
}

/** The older name for `cancel()`. */
export function interrupt(): void {
  cancel()
}

/** Whether the bridge socket is open right now. */
export function isConnected(): boolean {
  return bridge.isConnected()
}

/**
 * Connection state, for the UI. Worth surfacing because the socket *is* the
 * conversation: a drop wipes the agent's memory of the exchange while the
 * transcript on screen still shows it.
 */
export function watchConnection(
  fn: (state: bridge.ConnectionState) => void,
): void {
  bridge.watchConnection(fn)
}

/** Labels for the HUD's SYSTEMS rail. */
export function connectedLabels(): string[] {
  return bridge.bridgeServers()
}
