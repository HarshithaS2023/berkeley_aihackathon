import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  createCompetitionSession,
  getSessionByCode,
  getParticipants,
  joinSession,
  markSessionActive,
  markComplete,
  updateProgress,
  type CompetitionParticipant,
  type CompetitionSession,
} from '../lib/competition'
import type { QuizSettings, SessionResult, SourceProfile } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type CompetitionPhase =
  | 'idle'
  | 'waiting'   // in lobby, waiting for opponent
  | 'countdown' // both joined, 3-2-1 before quiz starts
  | 'quiz'      // actively taking the quiz
  | 'finished'  // this user done, waiting for opponent (optional)
  | 'results'   // both done
  | 'error'

type CompetitionState = {
  phase: CompetitionPhase
  session: CompetitionSession | null
  me: CompetitionParticipant | null
  rival: CompetitionParticipant | null
  error: string | null
  channel: RealtimeChannel | null
}

type CompetitionActions = {
  createSession(sourceProfile: SourceProfile, settings: QuizSettings, userName: string): Promise<void>
  joinByCode(code: string, userName: string): Promise<void>
  onQuizComplete(results: SessionResult[], score: number, correctCount: number): Promise<void>
  updateMyProgress(questionNumber: number, currentDifficulty: number, correctCount: number, score: number): Promise<void>
  reset(): void
}

const initial: CompetitionState = {
  phase: 'idle',
  session: null,
  me: null,
  rival: null,
  error: null,
  channel: null,
}

export const useCompetitionStore = create<CompetitionState & CompetitionActions>((set, get) => ({
  ...initial,

  async createSession(sourceProfile, settings, userName) {
    try {
      const session = await createCompetitionSession(sourceProfile, settings)
      const me = await joinSession(session.id, userName)
      set({ session, me, phase: 'waiting' })
      get()._subscribeToSession(session.id)
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to create session.' })
    }
  },

  async joinByCode(code, userName) {
    try {
      const session = await getSessionByCode(code)
      if (!session) { set({ phase: 'error', error: 'Session not found. Check your code.' }); return }
      if (session.status !== 'waiting') { set({ phase: 'error', error: 'This challenge has already started.' }); return }

      const existing = await getParticipants(session.id)
      if (existing.length >= 2) { set({ phase: 'error', error: 'This challenge is full.' }); return }

      const me = await joinSession(session.id, userName)
      const rival = existing[0] ?? null
      set({ session, me, rival, phase: 'waiting' })
      get()._subscribeToSession(session.id)
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to join session.' })
    }
  },

  async updateMyProgress(questionNumber, currentDifficulty, correctCount, score) {
    const { me } = get()
    if (!me) return
    await updateProgress(me.id, { questionNumber, currentDifficulty, correctCount, score })
    set({ me: { ...me, questionNumber, currentDifficulty, correctCount, score } })
  },

  async onQuizComplete(results, score, correctCount) {
    const { me, session } = get()
    if (!me || !session) return
    await markComplete(me.id, session.id, results, score, correctCount)
    set({ me: { ...me, completed: true, score, correctCount, results }, phase: 'finished' })
  },

  reset() {
    const { channel } = get()
    if (channel && supabase) supabase.removeChannel(channel)
    set(initial)
  },

  // Internal — wires Supabase real-time to keep rival + session status in sync
  _subscribeToSession(sessionId: string) {
    if (!supabase) return

    const channel = supabase
      .channel(`competition:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competition_participants', filter: `session_id=eq.${sessionId}` },
        async () => {
          const { me } = get()
          const all = await getParticipants(sessionId)
          const rival = all.find((p) => p.id !== me?.id) ?? null
          set({ rival })

          // Both players present → start countdown then quiz
          const { phase, session } = get()
          if (all.length === 2 && phase === 'waiting') {
            await markSessionActive(sessionId)
            set({ phase: 'countdown' })
            setTimeout(() => set({ phase: 'quiz' }), 3000)
          }

          // Both completed → show results
          if (all.length === 2 && all.every((p) => p.completed) && phase !== 'results') {
            set({ phase: 'results', rival })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'competition_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          set((s) => ({
            session: s.session
              ? { ...s.session, status: row.status as CompetitionSession['status'], startedAt: row.started_at as string | null }
              : s.session,
          }))
        },
      )
      .subscribe()

    set({ channel })
  },
} as CompetitionState & CompetitionActions & { _subscribeToSession(id: string): void }))
