import type { Difficulty, SessionResult } from '../types'

const clampDifficulty = (value: number): Difficulty =>
  Math.min(5, Math.max(1, value)) as Difficulty

export function calculateNextDifficulty(
  currentDifficulty: Difficulty,
  results: SessionResult[],
  recommendedDifficulty?: Difficulty,
): Difficulty {
  const recentResults = results.slice(-2)

  if (recentResults.length < 2) {
    return recommendedDifficulty ?? currentDifficulty
  }

  const twoCorrect = recentResults.every(
    (result) => result.feedback.correct && result.feedback.score >= 0.8,
  )
  const twoStruggling = recentResults.every(
    (result) => !result.feedback.correct || result.feedback.score < 0.5,
  )

  if (twoCorrect) {
    return clampDifficulty(currentDifficulty + 1)
  }

  if (twoStruggling) {
    return clampDifficulty(currentDifficulty - 1)
  }

  return recommendedDifficulty ?? currentDifficulty
}

export function collectWeakAreas(results: SessionResult[]): string[] {
  const missedConcepts = results.flatMap((result) =>
    result.feedback.correct ? [] : result.question.concepts,
  )

  return [...new Set(missedConcepts)].slice(-5)
}
