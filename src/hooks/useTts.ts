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
  const [error, setError] = useState<string | null>(null)
  const [readySet, setReadySet] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const speakRequestRef = useRef(0)

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
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
    }
  }, [cleanupAudio])

  const setSpeed = useCallback((nextSpeed: number) => {
    setSpeedState(nextSpeed)
    localStorage.setItem(STORAGE_KEY, String(nextSpeed))
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }, [])

  const stop = useCallback(() => {
    speakRequestRef.current += 1
    cleanupAudio()
  }, [cleanupAudio])

  const prefetch = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !prepareTextForSpeech(trimmed)) return
    void prefetchSpeechAudio(trimmed).then(() => {
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

        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url

        const audio = new Audio(url)
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
        setIsSpeaking(true)
        await audio.play()
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
    prefetch,
    isTextReady,
    speed,
    setSpeed,
    isSpeaking,
    isLoading,
    error,
  }
}
