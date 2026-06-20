import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UploadedFile {
  name: string
  base64: string
  mimeType: string
}

export interface Question {
  id: string
  text: string
  hints?: string[]
  correctAnswer: string
  difficulty: number
}

export interface Feedback {
  errorFound: boolean
  errorType?: string
  isRepeatedPattern: boolean
  feedbackText: string
}

export interface SummaryResponse {
  score: number
  commonMistakes: string[]
  strengths: string[]
  nextSteps: string[]
  timePerQuestion: number[]
}

export interface QuestionRecord {
  question: Question
  feedback: Feedback
  timeSpent: number
}

interface Settings {
  difficulty: number
  problemType: string
  similarToTest: boolean
  timerOff: boolean
  numQuestions: number
}

interface SourceProfile {
  topics: string[]
  rawText: string
}

interface AppStore {
  // Material upload
  uploadedFiles: UploadedFile[]
  setUploadedFiles: (files: UploadedFile[]) => void
  addUploadedFile: (file: UploadedFile) => void
  removeUploadedFile: (name: string) => void

  // Session configuration
  settings: Settings
  setSettings: (s: Partial<Settings>) => void

  // Source material analysis result
  sourceProfile: SourceProfile
  setMaterialContext: (ctx: Partial<SourceProfile>) => void

  // Active quiz session
  currentQuestion: Question | null
  setCurrentQuestion: (q: Question | null) => void

  currentDifficulty: number
  setCurrentDifficulty: (d: number) => void

  questionHistory: QuestionRecord[]
  addQuestionRecord: (r: QuestionRecord) => void

  weakAreas: string[]
  setWeakAreas: (areas: string[]) => void

  errorPatterns: string[]
  addErrorPattern: (pattern: string) => void

  // End-of-session summary
  summaryResponse: SummaryResponse | null
  setSummaryResponse: (s: SummaryResponse) => void

  // Reset for a new session
  resetSession: () => void
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      uploadedFiles: [],
      setUploadedFiles: (files) => set({ uploadedFiles: files }),
      addUploadedFile: (file) =>
        set((s) => ({ uploadedFiles: [...s.uploadedFiles, file] })),
      removeUploadedFile: (name) =>
        set((s) => ({
          uploadedFiles: s.uploadedFiles.filter((f) => f.name !== name),
        })),

      settings: {
        difficulty: 3,
        problemType: 'mixed',
        similarToTest: true,
        timerOff: false,
        numQuestions: 5,
      },
      setSettings: (s) =>
        set((prev) => ({ settings: { ...prev.settings, ...s } })),

      sourceProfile: { topics: [], rawText: '' },
      setMaterialContext: (ctx) =>
        set((prev) => ({ sourceProfile: { ...prev.sourceProfile, ...ctx } })),

      currentQuestion: null,
      setCurrentQuestion: (q) => set({ currentQuestion: q }),

      currentDifficulty: 3,
      setCurrentDifficulty: (d) => set({ currentDifficulty: d }),

      questionHistory: [],
      addQuestionRecord: (r) =>
        set((s) => ({ questionHistory: [...s.questionHistory, r] })),

      weakAreas: [],
      setWeakAreas: (areas) => set({ weakAreas: areas }),

      errorPatterns: [],
      addErrorPattern: (pattern) =>
        set((s) => ({ errorPatterns: [...s.errorPatterns, pattern] })),

      summaryResponse: null,
      setSummaryResponse: (s) => set({ summaryResponse: s }),

      resetSession: () =>
        set({
          currentQuestion: null,
          currentDifficulty: 3,
          questionHistory: [],
          weakAreas: [],
          errorPatterns: [],
          summaryResponse: null,
        }),
    }),
    { name: 'math-tutor-store' }
  )
)
