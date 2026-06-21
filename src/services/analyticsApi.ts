import { buildAnalyticsSnapshot } from '../lib/analyticsInsights'
import { supabase } from '../lib/supabase'
import type {
  AnalyticsSnapshot,
  DbMistake,
  DbQuestion,
  DbSession,
} from '../types/analytics'

export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.',
    )
  }

  const [sessionsRes, mistakesRes, questionsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, created_at, accuracy, avg_time, num_questions, topics')
      .order('created_at', { ascending: true }),
    supabase.from('mistakes').select('id, session_id, concept, error_pattern'),
    supabase
      .from('questions')
      .select('id, session_id, concepts, difficulty, correct, time_spent, hints_used'),
  ])

  if (sessionsRes.error) {
    throw new Error(`Failed to load sessions: ${sessionsRes.error.message}`)
  }
  if (mistakesRes.error) {
    throw new Error(`Failed to load mistakes: ${mistakesRes.error.message}`)
  }
  if (questionsRes.error) {
    throw new Error(`Failed to load questions: ${questionsRes.error.message}`)
  }

  return buildAnalyticsSnapshot(
    (sessionsRes.data ?? []) as DbSession[],
    (mistakesRes.data ?? []) as DbMistake[],
    (questionsRes.data ?? []) as DbQuestion[],
  )
}
