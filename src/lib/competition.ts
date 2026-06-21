import { supabase } from './supabase'
import type { Question, QuizSettings, SessionResult, SourceProfile } from '../types'

export type CompetitionSession = {
  id: string
  code: string
  sourceProfile: SourceProfile
  settings: QuizSettings
  questions: Question[]
  status: 'waiting' | 'active' | 'complete'
  createdAt: string
  startedAt: string | null
}

export type CompetitionParticipant = {
  id: string
  sessionId: string
  userName: string
  joinedAt: string
  questionNumber: number
  currentDifficulty: number
  correctCount: number
  score: number
  completed: boolean
  ready: boolean
  finishedAt: string | null
  results: SessionResult[] | null
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function toSession(row: Record<string, unknown>): CompetitionSession {
  return {
    id: row.id as string,
    code: row.code as string,
    sourceProfile: row.source_profile as SourceProfile,
    settings: row.settings as QuizSettings,
    questions: (row.questions as Question[]) ?? [],
    status: row.status as CompetitionSession['status'],
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string | null) ?? null,
  }
}

function toParticipant(row: Record<string, unknown>): CompetitionParticipant {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    userName: row.user_name as string,
    joinedAt: row.joined_at as string,
    questionNumber: row.question_number as number,
    currentDifficulty: row.current_difficulty as number,
    correctCount: row.correct_count as number,
    score: row.score as number,
    completed: row.completed as boolean,
    ready: (row.ready as boolean | undefined) ?? false,
    finishedAt: (row.finished_at as string | null) ?? null,
    results: (row.results as SessionResult[] | null) ?? null,
  }
}

export async function createCompetitionSession(
  sourceProfile: SourceProfile,
  settings: QuizSettings,
  questions: Question[],
): Promise<CompetitionSession> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const code = randomCode()
  const { data, error } = await supabase
    .from('competition_sessions')
    .insert({
      code,
      source_profile: sourceProfile,
      settings,
      questions,
      status: 'waiting',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return toSession(data)
}

export async function getSessionByCode(code: string): Promise<CompetitionSession | null> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('competition_sessions')
    .select()
    .eq('code', code.toUpperCase())
    .single()

  if (error) return null
  return toSession(data)
}

export async function joinSession(
  sessionId: string,
  userName: string,
): Promise<CompetitionParticipant> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('competition_participants')
    .insert({
      session_id: sessionId,
      user_name: userName,
      question_number: 0,
      current_difficulty: 3,
      correct_count: 0,
      score: 0,
      completed: false,
      ready: false,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return toParticipant(data)
}

export async function getParticipants(sessionId: string): Promise<CompetitionParticipant[]> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('competition_participants')
    .select()
    .eq('session_id', sessionId)

  if (error) throw new Error(error.message)
  return (data ?? []).map(toParticipant)
}

export async function setParticipantReady(
  participantId: string,
  ready: boolean,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('competition_participants')
    .update({ ready })
    .eq('id', participantId)

  if (error) throw new Error(error.message)
}

export async function markSessionActive(sessionId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  await supabase
    .from('competition_sessions')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', sessionId)
}

export async function updateProgress(
  participantId: string,
  update: {
    questionNumber: number
    currentDifficulty: number
    correctCount: number
    score: number
  },
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  await supabase
    .from('competition_participants')
    .update({
      question_number: update.questionNumber,
      current_difficulty: update.currentDifficulty,
      correct_count: update.correctCount,
      score: update.score,
    })
    .eq('id', participantId)
}

export async function markComplete(
  participantId: string,
  sessionId: string,
  results: SessionResult[],
  score: number,
  correctCount: number,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  await supabase
    .from('competition_participants')
    .update({
      completed: true,
      finished_at: new Date().toISOString(),
      results,
      score,
      correct_count: correctCount,
    })
    .eq('id', participantId)

  // Check if both participants are done; if so, close the session
  const { data } = await supabase
    .from('competition_participants')
    .select('completed')
    .eq('session_id', sessionId)

  const allDone = (data ?? []).every((p) => p.completed)
  if (allDone) {
    await supabase
      .from('competition_sessions')
      .update({ status: 'complete' })
      .eq('id', sessionId)
  }
}
