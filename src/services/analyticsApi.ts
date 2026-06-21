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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw new Error(`Authentication error: ${authError.message}`)
  }
  if (!user) {
    throw new Error('Sign in to view your analytics.')
  }

  const sessionsRes = await supabase
    .from('sessions')
    .select('id, created_at, accuracy, avg_time, num_questions, topics')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (sessionsRes.error) {
    const message = sessionsRes.error.message
    if (message.includes('user_id') && message.includes('does not exist')) {
      throw new Error(
        'Database setup incomplete: the sessions.user_id column is missing. Run supabase/auth_migration.sql in the Supabase SQL Editor (Dashboard → SQL → New query), then refresh this page.',
      )
    }
    throw new Error(`Failed to load sessions: ${message}`)
  }

  const sessions = (sessionsRes.data ?? []) as DbSession[]

  if (sessions.length === 0) {
    return buildAnalyticsSnapshot([], [], [])
  }

  const sessionIds = sessions.map((session) => session.id)

  const [mistakesRes, questionsRes] = await Promise.all([
    supabase
      .from('mistakes')
      .select('id, session_id, concept, error_pattern')
      .in('session_id', sessionIds),
    supabase
      .from('questions')
      .select(
        'id, session_id, question, answer, concepts, difficulty, correct, time_spent, hints_used',
      )
      .in('session_id', sessionIds),
  ])

  if (mistakesRes.error) {
    throw new Error(`Failed to load mistakes: ${mistakesRes.error.message}`)
  }
  if (questionsRes.error) {
    throw new Error(`Failed to load questions: ${questionsRes.error.message}`)
  }

  return buildAnalyticsSnapshot(
    sessions,
    (mistakesRes.data ?? []) as DbMistake[],
    (questionsRes.data ?? []) as DbQuestion[],
  )
}
