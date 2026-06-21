import { create } from 'zustand'
import {
  calculateNextDifficulty,
  collectWeakAreas,
} from '../lib/adaptiveDifficulty'
import { quizApi } from '../services/quizApi'
import { saveSession } from '../services/sessionApi'
import type {
  Question,
  QuizSessionState,
  QuizSettings,
  SourceProfile,
  WorkSubmission,
} from '../types'

// Generate against the latest graded result so queued questions never use a
// stale difficulty level.
const BATCH_SIZE = 1

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'

function getBatchCount(state: QuizSessionState): number {
  const remaining =
    state.settings.numQuestions - state.results.length - state.questionQueue.length
  return Math.min(BATCH_SIZE, Math.max(0, remaining))
}

function buildGenerateRequest(state: QuizSessionState) {
  return {
    sourceProfile: state.sourceProfile!,
    currentDifficulty: state.currentDifficulty,
    problemType: state.settings.problemType,
    similarity: state.settings.similarity,
    previousQuestions: state.questionHistory.map((q) => q.question),
    weakAreas: state.weakAreas,
  }
}

async function fetchQuestionBatch(state: QuizSessionState): Promise<Question[]> {
  const batchCount = getBatchCount(state)
  if (batchCount <= 0 || !state.sourceProfile) return []

  return quizApi.generateQuestions(buildGenerateRequest(state), batchCount)
}

const defaultSettings: QuizSettings = {
  numQuestions: 3,
  problemType: 'word_problem',
  similarity: 'same_concepts',
  startingDifficulty: 2,
}

type QuizActions = {
  setSettings: (settings: Partial<QuizSettings>) => void
  setSourceProfile: (sourceProfile: SourceProfile) => void
  warmQuestionQueue: (totalNeeded?: number) => string | null
  startQuiz: () => Promise<void>
  startPreloadedQuiz: (questions: Question[]) => Promise<void>
  generateNextQuestion: () => Promise<void>
  tickTimer: () => void
  revealHint: () => void
  submitCurrentQuestion: (
    submission: Omit<WorkSubmission, 'responseTimeSeconds' | 'hintsUsed'>,
  ) => Promise<void>
  continueQuiz: () => Promise<void>
  resetQuiz: () => void
}

type QuizStore = QuizSessionState & QuizActions

const initialState: QuizSessionState = {
  phase: 'setup',
  settings: defaultSettings,
  sourceProfile: null,
  sessionId: null,
  currentQuestion: null,
  currentDifficulty: defaultSettings.startingDifficulty,
  questionHistory: [],
  questionQueue: [],
  weakAreas: [],
  results: [],
  summary: null,
  elapsedSeconds: 0,
  hintsUsed: 0,
  visibleHints: [],
  streamingFeedback: null,
  error: null,
}

export const useQuizStore = create<QuizStore>((set, get) => ({
  ...initialState,

  setSettings: (settings) =>
    set((state) => ({
      settings: { ...state.settings, ...settings },
    })),

  setSourceProfile: (sourceProfile) => set({ sourceProfile }),

  warmQuestionQueue: (totalNeeded) => {
    const state = get()
    if (!state.sourceProfile) return null

    const sessionId = crypto.randomUUID()
    set({ sessionId })
    void quizApi
      .warmQuestionQueue(
        sessionId,
        buildGenerateRequest({
          ...state,
          sessionId,
          currentDifficulty: state.settings.startingDifficulty,
        }),
        totalNeeded ?? state.settings.numQuestions,
      )
      .catch(() => {
        // generateNextQuestion falls back to synchronous generation.
      })
    return sessionId
  },

  startQuiz: async () => {
    const { settings, sessionId } = get()
    set({
      phase: 'generating',
      results: [],
      questionHistory: [],
      questionQueue: [],
      weakAreas: [],
      summary: null,
      sessionId,
      currentDifficulty: settings.startingDifficulty,
      streamingFeedback: null,
      error: null,
    })
    await get().generateNextQuestion()
  },

  startPreloadedQuiz: async (questions) => {
    const { settings } = get()
    set({
      phase: 'generating',
      results: [],
      questionHistory: [...questions],
      questionQueue: [...questions],
      weakAreas: [],
      summary: null,
      sessionId: null,
      currentDifficulty: settings.startingDifficulty,
      streamingFeedback: null,
      error: null,
    })
    await get().generateNextQuestion()
  },

  generateNextQuestion: async () => {
    const state = get()

    // Serve from pre-generated queue when available
    if (state.questionQueue.length > 0) {
      const [next, ...rest] = state.questionQueue
      set({
        phase: 'answering',
        currentQuestion: next,
        questionQueue: rest,
        elapsedSeconds: 0,
        hintsUsed: 0,
        visibleHints: [],
        streamingFeedback: null,
      })
      return
    }

    if (!state.sourceProfile) {
      set({ phase: 'error', error: 'Analyze or select source material first.' })
      return
    }

    set({ phase: 'generating', error: null })

    try {
      if (state.sessionId) {
        const queuedQuestion = await quizApi.dequeueQuestion(state.sessionId)
        if (queuedQuestion) {
          set({
            phase: 'answering',
            currentQuestion: queuedQuestion,
            questionHistory: [...state.questionHistory, queuedQuestion],
            elapsedSeconds: 0,
            hintsUsed: 0,
            visibleHints: [],
            streamingFeedback: null,
          })
          return
        }
      }

      const questions = await fetchQuestionBatch(state)
      if (questions.length === 0) {
        set({ phase: 'error', error: 'No questions were generated.' })
        return
      }

      const [first, ...rest] = questions

      set({
        phase: 'answering',
        currentQuestion: first,
        questionQueue: rest,
        questionHistory: [...state.questionHistory, ...questions],
        elapsedSeconds: 0,
        hintsUsed: 0,
        visibleHints: [],
        streamingFeedback: null,
      })
    } catch (error) {
      set({ phase: 'error', error: getErrorMessage(error) })
    }
  },

  tickTimer: () =>
    set((state) =>
      state.phase === 'answering'
        ? { elapsedSeconds: state.elapsedSeconds + 1 }
        : {},
    ),

  revealHint: () =>
    set((state) => {
      const hint = state.currentQuestion?.hints[state.hintsUsed]
      if (!hint) return {}
      return {
        hintsUsed: state.hintsUsed + 1,
        visibleHints: [...state.visibleHints, hint],
      }
    }),

  submitCurrentQuestion: async (submission) => {
    const state = get()
    if (!state.currentQuestion || state.phase !== 'answering') return

    const packagedSubmission: WorkSubmission = {
      ...submission,
      responseTimeSeconds: state.elapsedSeconds,
      hintsUsed: state.hintsUsed,
    }

    set({ phase: 'submitting', streamingFeedback: '', error: null })

    try {
      const feedback = await quizApi.analyzeWorkStream(
        {
          question: state.currentQuestion,
          submission: packagedSubmission,
          priorErrorPatterns: state.results.flatMap(
            (result) => result.feedback.errorPatterns,
          ),
        },
        (delta) =>
          set((current) => ({
            streamingFeedback: `${current.streamingFeedback ?? ''}${delta}`,
          })),
      )
      const results = [
        ...state.results,
        {
          question: state.currentQuestion,
          submission: packagedSubmission,
          feedback,
        },
      ]

      const weakAreas = collectWeakAreas(results)
      const currentDifficulty = calculateNextDifficulty(
        state.currentDifficulty,
        results,
        feedback.recommendedDifficulty,
      )

      let sessionId = state.sessionId
      if (sessionId && results.length < state.settings.numQuestions) {
        const nextState = {
          ...state,
          results,
          weakAreas,
          currentDifficulty,
        }
        try {
          await quizApi.refillQuestionQueue(
            sessionId,
            buildGenerateRequest(nextState),
            state.settings.numQuestions - results.length,
          )
        } catch {
          // Fall back to synchronous generation at the updated difficulty.
          sessionId = null
        }
      }

      set({
        phase: 'feedback',
        results,
        weakAreas,
        currentDifficulty,
        sessionId,
        streamingFeedback: null,
      })
    } catch (error) {
      set({ phase: 'error', error: getErrorMessage(error) })
    }
  },

  continueQuiz: async () => {
    const state = get()
    if (state.results.length < state.settings.numQuestions) {
      await state.generateNextQuestion()
      return
    }

    set({ phase: 'submitting', streamingFeedback: null })
    try {
      const summary = await quizApi.generateSummary(state.results)
      set({ phase: 'summary', summary })

      if (state.sourceProfile) {
        void saveSession({
          settings: state.settings,
          sourceProfile: state.sourceProfile,
          results: state.results,
          summary,
        })
      }
    } catch (error) {
      set({ phase: 'error', error: getErrorMessage(error) })
    }
  },

  resetQuiz: () => {
    set({ ...initialState })
  },
}))
