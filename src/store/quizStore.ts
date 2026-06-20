import { create } from 'zustand'
import {
  calculateNextDifficulty,
  collectWeakAreas,
} from '../lib/adaptiveDifficulty'
import { quizApi } from '../services/quizApi'
import type {
  QuizSessionState,
  QuizSettings,
  SourceProfile,
  WorkSubmission,
} from '../types'

const BATCH_SIZE = 5

const defaultSettings: QuizSettings = {
  numQuestions: 3,
  problemType: 'word_problem',
  similarity: 'same_concepts',
  startingDifficulty: 2,
}

type QuizActions = {
  setSettings: (settings: Partial<QuizSettings>) => void
  setSourceProfile: (sourceProfile: SourceProfile) => void
  startQuiz: () => Promise<void>
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
  error: null,
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'

export const useQuizStore = create<QuizStore>((set, get) => ({
  ...initialState,

  setSettings: (settings) =>
    set((state) => ({
      settings: { ...state.settings, ...settings },
    })),

  setSourceProfile: (sourceProfile) => set({ sourceProfile }),

  startQuiz: async () => {
    const { settings } = get()
    set({
      results: [],
      questionHistory: [],
      questionQueue: [],
      weakAreas: [],
      summary: null,
      currentDifficulty: settings.startingDifficulty,
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
      })
      return
    }

    if (!state.sourceProfile) {
      set({ phase: 'error', error: 'Analyze or select source material first.' })
      return
    }

    set({ phase: 'generating', error: null })

    try {
      const answeredCount = state.results.length
      const remaining = state.settings.numQuestions - answeredCount
      const batchCount = Math.min(BATCH_SIZE, remaining)

      const questions = await quizApi.generateQuestions(
        {
          sourceProfile: state.sourceProfile,
          currentDifficulty: state.currentDifficulty,
          problemType: state.settings.problemType,
          similarity: state.settings.similarity,
          previousQuestions: state.questionHistory.map((q) => q.question),
          weakAreas: state.weakAreas,
        },
        batchCount,
      )

      const [first, ...rest] = questions

      set({
        phase: 'answering',
        currentQuestion: first,
        questionQueue: rest,
        questionHistory: [...state.questionHistory, ...questions],
        elapsedSeconds: 0,
        hintsUsed: 0,
        visibleHints: [],
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

    set({ phase: 'submitting', error: null })

    try {
      const feedback = await quizApi.analyzeWork({
        question: state.currentQuestion,
        submission: packagedSubmission,
      })
      const results = [
        ...state.results,
        {
          question: state.currentQuestion,
          submission: packagedSubmission,
          feedback,
        },
      ]

      set({
        phase: 'feedback',
        results,
        weakAreas: collectWeakAreas(results),
        currentDifficulty: calculateNextDifficulty(
          state.currentDifficulty,
          results,
          feedback.recommendedDifficulty,
        ),
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

    set({ phase: 'submitting' })
    try {
      const summary = await quizApi.generateSummary(state.results)
      set({ phase: 'summary', summary })
    } catch (error) {
      set({ phase: 'error', error: getErrorMessage(error) })
    }
  },

  resetQuiz: () => set({ ...initialState }),
}))
