import { prepareTextForSpeech } from '../lib/ttsSpeechText'
import { API_BASE } from '../lib/apiBase'

const audioCache = new Map<string, Promise<Blob>>()

async function fetchSpeechBlob(preparedText: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: preparedText }),
  })

  if (!response.ok) {
    let detail = `Text-to-speech failed (${response.status}).`
    try {
      const data = await response.json()
      if (data?.detail) detail = String(data.detail)
    } catch {
      // response had no JSON body
    }
    throw new Error(detail)
  }

  return response.blob()
}

function cacheKey(rawText: string): string | null {
  const prepared = prepareTextForSpeech(rawText.trim())
  return prepared || null
}

function loadSpeechAudio(key: string): Promise<Blob> {
  const existing = audioCache.get(key)
  if (existing) return existing

  const pending = fetchSpeechBlob(key).catch((error) => {
    audioCache.delete(key)
    throw error
  })
  audioCache.set(key, pending)
  return pending
}

/** Start fetching audio in the background so playback can begin immediately later. */
export function prefetchSpeechAudio(rawText: string): void {
  const key = cacheKey(rawText)
  if (key) loadSpeechAudio(key)
}

export async function fetchSpeechAudio(rawText: string): Promise<Blob> {
  const key = cacheKey(rawText)
  if (!key) {
    throw new Error('Nothing to read aloud after preparing the text.')
  }
  return loadSpeechAudio(key)
}

export function clearSpeechAudioCache(): void {
  audioCache.clear()
}
