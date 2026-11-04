import { env, BRIDGE_HTTP_URL } from '../config'

/** Only used when USE_ELEVENLABS is on. Bridge proxy first (it already holds
 *  the key), then a direct key, then null to fall back to the native voice. */
export async function fetchCloudAudio(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${BRIDGE_HTTP_URL}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.ok) return URL.createObjectURL(await res.blob())
  } catch {
    /* fall through */
  }

  if (env.elevenKey) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${env.elevenVoiceId}/stream` +
          `?output_format=mp3_22050_32&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': env.elevenKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75,
              speed: 1.05,
            },
          }),
        },
      )
      if (res.ok) return URL.createObjectURL(await res.blob())
    } catch {
      /* fall through */
    }
  }

  return null
}
