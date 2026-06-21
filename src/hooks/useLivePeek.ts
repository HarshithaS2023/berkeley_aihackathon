import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { quizApi } from '../services/quizApi'
import type { Question } from '../types'
import type { WhiteboardHandle } from '../components/Whiteboard/Whiteboard'

type UseLivePeekOptions = {
  whiteboardRef: RefObject<WhiteboardHandle | null>
  question: Question | null
  enabled: boolean
}

function snapshotKey(base64: string): string {
  return `${base64.length}:${base64.slice(0, 48)}:${base64.slice(-48)}`
}

export function useLivePeek({ whiteboardRef, question, enabled }: UseLivePeekOptions) {
  const [peek, setPeek] = useState('')
  const [spoken, setSpoken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [changeCount, setChangeCount] = useState(0)
  const lastSnapshotRef = useRef('')
  const lastPeekAtRef = useRef(0)

  const notifyChange = useCallback(() => {
    setChangeCount((count) => count + 1)
  }, [])

  useEffect(() => {
    lastSnapshotRef.current = ''
    lastPeekAtRef.current = 0
    const resetFeedback = window.setTimeout(() => {
      setPeek('')
      setSpoken('')
      setError(null)
    }, 0)
    return () => window.clearTimeout(resetFeedback)
  }, [question?.id])

  useEffect(() => {
    if (!enabled || !question || changeCount === 0) return

    const timeout = window.setTimeout(() => {
      const waitForMinInterval = Math.max(0, 3000 - (Date.now() - lastPeekAtRef.current))

      window.setTimeout(() => {
        void (async () => {
          if (!whiteboardRef.current?.hasContent()) return

          const imageBase64 = await whiteboardRef.current.exportToBase64()
          if (!imageBase64) return

          const key = snapshotKey(imageBase64)
          if (key === lastSnapshotRef.current) return

          lastSnapshotRef.current = key
          lastPeekAtRef.current = Date.now()
          setLoading(true)
          setError(null)

          try {
            const response = await quizApi.livePeek(
              imageBase64,
              question.question,
              question.answer,
            )
            setPeek(response.peek)
            setSpoken(response.spoken)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Live feedback is unavailable.')
          } finally {
            setLoading(false)
          }
        })()
      }, waitForMinInterval)
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [changeCount, enabled, question, whiteboardRef])

  return { peek, spoken, error, loading, notifyChange }
}
