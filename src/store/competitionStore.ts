import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  createCompetitionSession,
  getParticipants,
  getSessionByCode,
  joinSession,
  markComplete,
  markSessionActive,
  setParticipantReady,
  updateProgress,
  type CompetitionParticipant,
  type CompetitionSession,
} from '../lib/competition'
import { quizApi } from '../services/quizApi'
import type { QuizSettings, SessionResult, SourceProfile } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type CompetitionPhase =
  | 'idle'
  | 'waiting'
  | 'countdown'
  | 'quiz'
  | 'finished'
  | 'results'
  | 'error'

type CompetitionState = {
  phase: CompetitionPhase
  session: CompetitionSession | null
  me: CompetitionParticipant | null
  rival: CompetitionParticipant | null
  error: string | null
  channel: RealtimeChannel | null
  countdownTimer: ReturnType<typeof setTimeout> | null
}

type CompetitionActions = {
  createSession(sourceProfile: SourceProfile, settings: QuizSettings, userName: string): Promise<void>
  joinByCode(code: string, userName: string): Promise<void>
  setReady(ready: boolean): Promise<void>
  refreshLobby(): Promise<void>
  onQuizComplete(results: SessionResult[], score: number, correctCount: number): Promise<void>
  updateMyProgress(questionNumber: number, currentDifficulty: number, correctCount: number, score: number): Promise<void>
  reset(): void
}

type CompetitionStore = CompetitionState & CompetitionActions

const initial: CompetitionState = {
  phase: 'idle',
  session: null,
  me: null,
  rival: null,
  error: null,
  channel: null,
  countdownTimer: null,
}

function syncParticipants(
  all: CompetitionParticipant[],
  meId: string | undefined,
): { me: CompetitionParticipant | null; rival: CompetitionParticipant | null } {
  const me = all.find((p) => p.id === meId) ?? null
  const rival = all.find((p) => p.id !== meId) ?? null
  return { me, rival }
}

function beginCountdown(set: (partial: Partial<CompetitionState>) => void, get: () => CompetitionStore) {
  const { countdownTimer, phase } = get()
  if (phase === 'countdown' || phase === 'quiz' || phase === 'finished' || phase === 'results') return
  if (countdownTimer) clearTimeout(countdownTimer)

  set({ phase: 'countdown' })
  const timer = setTimeout(() => {
    set({ phase: 'quiz', countdownTimer: null })
  }, 3000)
  set({ countdownTimer: timer })
}

async function maybeStartSession(set: (partial: Partial<CompetitionState>) => void, get: () => CompetitionStore) {
  const { phase, session } = get()
  if (phase !== 'waiting' || !session || session.status !== 'waiting') return

  const all = await getParticipants(session.id)
  const { me, rival } = syncParticipants(all, get().me?.id)
  set({ me: me ?? get().me, rival })

  if (all.length < 2 || !all.every((p) => p.ready)) return

  await markSessionActive(session.id)
  set({
    session: { ...session, status: 'active', startedAt: new Date().toISOString() },
  })
  beginCountdown(set, get)
}

function subscribeToSession(
  sessionId: string,
  set: (partial: Partial<CompetitionState>) => void,
  get: () => CompetitionStore,
) {
  if (!supabase) return

  const { channel: existingChannel } = get()
  if (existingChannel) supabase.removeChannel(existingChannel)

  const channel = supabase
    .channel(`competition:${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'competition_participants', filter: `session_id=eq.${sessionId}` },
      async () => {
        const { me, phase } = get()
        const all = await getParticipants(sessionId)
        const synced = syncParticipants(all, me?.id)
        set({ me: synced.me ?? me, rival: synced.rival })

        if (all.length === 2 && all.every((p) => p.completed) && phase !== 'results') {
          set({ phase: 'results', rival: synced.rival })
          return
        }

        await maybeStartSession(set, get)
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'competition_sessions', filter: `id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>
        const status = row.status as CompetitionSession['status']
        const current = get()
        set({
          session: current.session
            ? {
                ...current.session,
                status,
                startedAt: (row.started_at as string | null) ?? current.session.startedAt,
              }
            : current.session,
        })

        if (status === 'active') {
          beginCountdown(set, get)
        }
      },
    )
    .subscribe()

  set({ channel })
}

export const useCompetitionStore = create<CompetitionStore>((set, get) => ({
  ...initial,

  async createSession(sourceProfile, settings, userName) {
    try {
      set({ error: null })
      const questions = await quizApi.generateCompetitionQuestions(sourceProfile, settings)
      const session = await createCompetitionSession(sourceProfile, settings, questions)
      const me = await joinSession(session.id, userName)
      set({ session, me, rival: null, phase: 'waiting', error: null })
      subscribeToSession(session.id, set, get)
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to create session.' })
    }
  },

  async joinByCode(code, userName) {
    try {
      set({ error: null })
      const session = await getSessionByCode(code)
      if (!session) {
        set({ phase: 'error', error: 'Session not found. Check your code.' })
        return
      }
      if (session.status === 'complete') {
        set({ phase: 'error', error: 'This challenge has already finished.' })
        return
      }

      const existing = await getParticipants(session.id)
      if (existing.length >= 2) {
        set({ phase: 'error', error: 'This challenge is full.' })
        return
      }

      const me = await joinSession(session.id, userName)
      const rival = existing[0] ?? null
      set({ session, me, rival, phase: session.status === 'active' ? 'quiz' : 'waiting', error: null })
      subscribeToSession(session.id, set, get)

      if (session.status === 'active') {
        set({ phase: 'quiz' })
      } else {
        await get().refreshLobby()
      }
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to join session.' })
    }
  },

  async setReady(ready) {
    const { me } = get()
    if (!me) return

    try {
      await setParticipantReady(me.id, ready)
      set({ me: { ...me, ready } })
      await maybeStartSession(set, get)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update ready status.' })
    }
  },

  async refreshLobby() {
    const { session, me } = get()
    if (!session || !me) return

    const all = await getParticipants(session.id)
    const synced = syncParticipants(all, me.id)
    set({ me: synced.me ?? me, rival: synced.rival })

    if (session.status === 'active' && get().phase === 'waiting') {
      beginCountdown(set, get)
      return
    }

    await maybeStartSession(set, get)
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
    const { channel, countdownTimer } = get()
    if (channel && supabase) supabase.removeChannel(channel)
    if (countdownTimer) clearTimeout(countdownTimer)
    set(initial)
  },
}))
