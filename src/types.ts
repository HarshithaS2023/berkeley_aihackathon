export type Difficulty = 1 | 2 | 3 | 4 | 5

export type ProblemType = 'definition' | 'computation' | 'word_problem'

export type SimilarityLevel =
  | 'very_similar'
  | 'same_concepts'
  | 'concept_transfer'

export type QuizPhase =
  | 'setup'
  | 'generating'
  | 'answering'
  | 'submitting'
  | 'feedback'
  | 'summary'
  | 'error'

export type SourceProfile = {
  topics: string[]
  concepts: string[]
  styleNotes: string
}

export type QuizSettings = {
  numQuestions: number
  problemType: ProblemType
  similarity: SimilarityLevel
  startingDifficulty: Difficulty
}

export type GenerateQuestionRequest = {
  sourceProfile: SourceProfile
  currentDifficulty: Difficulty
  problemType: ProblemType
  similarity: SimilarityLevel
  previousQuestions: string[]
  weakAreas: string[]
}

// Shared API contract. Coordinate changes to these three response types
// with the backend lead before merging.
export type Question = {
  id: string
  question: string
  hints: string[]
  answer: string
  solution: string
  difficulty: Difficulty
  concepts: string[]
}

export type WorkSubmission = {
  responseTimeSeconds: number
  answerText?: string
  whiteboardImageBase64?: string
  uploadedWorkFileBase64?: string
  hintsUsed: number
}

export type WorkSubmissionInput = Omit<WorkSubmission, 'responseTimeSeconds' | 'hintsUsed'>

export type AnalyzeWorkRequest = {
  question: Question
  submission: WorkSubmission
  priorErrorPatterns: string[]
}

export type AnalyzeWorkStreamDone = {
  correct: boolean
  partially_correct?: boolean
  error_found: boolean
  is_repeated_pattern: boolean
  conceptual_gap: string
  feedback_text: string
  submitted_answer?: string
  expected_answer?: string
  numerical_difference?: number | null
  first_incorrect_step?: string
  error_type?: string
  strength?: string
  next_step?: string
}

export type LivePeekResponse = {
  peek: string
  spoken: string
}

export type Feedback = {
  correct: boolean
  partiallyCorrect?: boolean
  score: number
  feedback: string
  submittedAnswer?: string
  expectedAnswer: string
  numericalDifference?: number
  firstIncorrectStep?: string
  conceptualGap?: string
  repeatedPattern: boolean
  errorPatterns: string[]
  strengths: string[]
  suggestedNextStep: string
  recommendedDifficulty: Difficulty
}

export type SessionResult = {
  question: Question
  submission: WorkSubmission
  feedback: Feedback
}

export type SummaryResponse = {
  accuracy: number
  averageResponseTimeSeconds: number
  mostMissedConcepts: string[]
  commonMistakes: string[]
  strengths: string[]
  suggestedNextSteps: string[]
}

export type QuizSessionState = {
  phase: QuizPhase
  settings: QuizSettings
  sourceProfile: SourceProfile | null
  sessionId: string | null
  currentQuestion: Question | null
  currentDifficulty: Difficulty
  questionHistory: Question[]
  questionQueue: Question[]
  weakAreas: string[]
  results: SessionResult[]
  summary: SummaryResponse | null
  elapsedSeconds: number
  hintsUsed: number
  visibleHints: string[]
  streamingFeedback: string | null
  error: string | null
}
