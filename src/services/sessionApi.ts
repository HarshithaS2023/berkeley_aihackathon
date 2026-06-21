import { supabase } from '../lib/supabase'
import type {
  QuizSettings,
  SessionResult,
  SourceProfile,
  SummaryResponse,
} from '../types'

export type SaveSessionInput = {
  settings: QuizSettings
  sourceProfile: SourceProfile
  results: SessionResult[]
  summary: SummaryResponse
}

function buildMistakeRows(sessionId: string, results: SessionResult[]) {
  const rows: { session_id: string; concept: string; error_pattern: string }[] = []

  for (const result of results) {
    if (result.feedback.correct) continue

    const concepts =
      result.question.concepts.length > 0 ? result.question.concepts : ['general']
    const patterns = result.feedback.errorPatterns

    if (patterns.length === 0) {
      for (const concept of concepts) {
        rows.push({ session_id: sessionId, concept, error_pattern: '' })
      }
      continue
    }

    for (const [index, pattern] of patterns.entries()) {
      rows.push({
        session_id: sessionId,
        concept: concepts[index] ?? concepts[0] ?? 'general',
        error_pattern: pattern,
      })
    }
  }

  return rows
}

/** Persist a completed quiz session for the signed-in user. */
export async function saveSession(input: SaveSessionInput): Promise<boolean> {
  if (!supabase) {
    console.warn('[saveSession] Supabase not configured — skipping save.')
    return false
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    console.warn('[saveSession] Not signed in — session not saved.')
    return false
  }

  const { settings, sourceProfile, results, summary } = input

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      accuracy: summary.accuracy,
      avg_time: Math.round(summary.averageResponseTimeSeconds),
      num_questions: settings.numQuestions,
      topics: sourceProfile.topics,
    })
    .select('id')
    .single()

  if (sessionError || !sessionRow) {
    console.error('[saveSession] Failed to insert session:', sessionError?.message)
    return false
  }

  const sessionId = sessionRow.id as string

  const questionRows = results.map((result) => ({
    session_id: sessionId,
    question: result.question.question,
    answer: result.question.answer,
    concepts: result.question.concepts,
    difficulty: result.question.difficulty,
    correct: result.feedback.correct,
    time_spent: result.submission.responseTimeSeconds,
    hints_used: result.submission.hintsUsed,
  }))

  const { error: questionsError } = await supabase.from('questions').insert(questionRows)

  if (questionsError) {
    console.error('[saveSession] Failed to insert questions:', questionsError.message)
    return false
  }

  const mistakeRows = buildMistakeRows(sessionId, results)
  if (mistakeRows.length > 0) {
    const { error: mistakesError } = await supabase.from('mistakes').insert(mistakeRows)

    if (mistakesError) {
      console.error('[saveSession] Failed to insert mistakes:', mistakesError.message)
      return false
    }
  }

  return true
}
