import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareTextForSpeech } from '../lib/ttsSpeechText'
import {
  clearSpeechAudioCache,
  fetchSpeechAudio,
  prefetchSpeechAudio,
} from '../services/ttsApi'

export const TTS_SPEED_OPTIONS = [
  { value: 0.75, label: '0.75×' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
] as const

const STORAGE_KEY = 'quiz-tts-speed'

function readStoredSpeed(): number {
  const stored = localStorage.getItem(STORAGE_KEY)
  const parsed = stored ? Number.parseFloat(stored) : 1
  return TTS_SPEED_OPTIONS.some((option) => option.value === parsed) ? parsed : 1
}

export function useTts() {
  const [speed, setSpeedState] = useState(readStoredSpeed)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readySet, setReadySet] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const speakRequestRef = useRef(0)

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop()
      } catch {
        // The source may have already ended.
      }
      audioSourceRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setIsSpeaking(false)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return () => {
      speakRequestRef.current += 1
      cleanupAudio()
      clearSpeechAudioCache()
      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [cleanupAudio])

  const setSpeed = useCallback((nextSpeed: number) => {
    setSpeedState(nextSpeed)
    localStorage.setItem(STORAGE_KEY, String(nextSpeed))
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.playbackRate.value = nextSpeed
    }
  }, [])

  const unlockAudio = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      if (context.state !== 'running') {
        await context.resume()
      }

      // Starting a silent buffer during the click permanently unlocks this
      // context for later live-feedback playback.
      const silentBuffer = context.createBuffer(1, 1, context.sampleRate)
      const silentSource = context.createBufferSource()
      silentSource.buffer = silentBuffer
      silentSource.connect(context.destination)
      silentSource.start()
      const unlocked = context.state === 'running'
      setIsAudioUnlocked(unlocked)
      return unlocked
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Your browser could not enable audio.',
      )
      return false
    }
  }, [])

  const stop = useCallback(() => {
    speakRequestRef.current += 1
    cleanupAudio()
  }, [cleanupAudio])

  const prefetch = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !prepareTextForSpeech(trimmed)) return
    void prefetchSpeechAudio(trimmed).then((ready) => {
      if (!ready) return
      setReadySet((prev) => {
        if (prev.has(trimmed)) return prev
        const next = new Set(prev)
        next.add(trimmed)
        return next
      })
    })
  }, [])

  const isTextReady = useCallback(
    (text: string) => readySet.has(text.trim()),
    [readySet],
  )

  const speak = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const requestId = speakRequestRef.current + 1
      speakRequestRef.current = requestId

      setError(null)
      cleanupAudio()
      setIsLoading(true)

      try {
        const speechText = prepareTextForSpeech(trimmed)
        if (!speechText) {
          setError('Nothing to read aloud after preparing the text.')
          cleanupAudio()
          return
        }

        const blob = await fetchSpeechAudio(trimmed)
        if (speakRequestRef.current !== requestId) return

        const context = audioContextRef.current
        if (context?.state === 'running') {
          const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer())
          if (speakRequestRef.current !== requestId) return

          const source = context.createBufferSource()
          source.buffer = audioBuffer
          source.playbackRate.value = speed
          source.connect(context.destination)
          source.onended = () => {
            if (speakRequestRef.current === requestId) cleanupAudio()
          }
          audioSourceRef.current = source
          setIsLoading(false)
          setIsSpeaking(true)
          source.start()
          return
        }

        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url

        const audio = new Audio(url)
        audio.preload = 'auto'
        audio.playbackRate = speed
        audioRef.current = audio

        audio.onended = () => {
          if (speakRequestRef.current === requestId) cleanupAudio()
        }
        audio.onerror = () => {
          if (speakRequestRef.current === requestId) {
            setError('Failed to play audio.')
            cleanupAudio()
          }
        }

        setIsLoading(false)
        await audio.play()
        setIsSpeaking(true)
      } catch (err) {
        if (speakRequestRef.current === requestId) {
          setError(err instanceof Error ? err.message : 'Failed to read aloud.')
          cleanupAudio()
        }
      }
    },
    [cleanupAudio, speed],
  )

  return {
    speak,
    stop,
    unlockAudio,
    prefetch,
    isTextReady,
    speed,
    setSpeed,
    isSpeaking,
    isLoading,
    isAudioUnlocked,
    error,
  }
}
