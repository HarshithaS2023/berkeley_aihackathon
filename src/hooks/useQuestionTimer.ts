import { useEffect } from 'react'
import { useQuizStore } from '../store/quizStore'

export function useQuestionTimer() {
  const phase = useQuizStore((state) => state.phase)
  const tickTimer = useQuizStore((state) => state.tickTimer)

  useEffect(() => {
    if (phase !== 'answering') return

    const intervalId = window.setInterval(tickTimer, 1000)
    return () => window.clearInterval(intervalId)
  }, [phase, tickTimer])
}
