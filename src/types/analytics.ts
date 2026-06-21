export type DbSession = {
  id: string
  created_at: string
  accuracy: number
  avg_time: number
  num_questions: number
  topics: string[]
}

export type DbMistake = {
  id: string
  session_id: string
  concept: string
  error_pattern: string
}

export type DbQuestion = {
  id: string
  session_id: string
  question: string
  answer: string
  concepts: string[]
  difficulty: number
  correct: boolean
  time_spent: number
  hints_used: number
}

export type PastQuestion = {
  id: string
  sessionId: string
  sessionDate: string
  sessionLabel: string
  sessionTopics: string[]
  question: string
  answer: string
  concepts: string[]
  difficulty: number
  correct: boolean
  timeSpent: number
  hintsUsed: number
}

export type SessionTrendPoint = {
  sessionId: string
  label: string
  date: string
  accuracyPct: number
  avgTimeSec: number
  topics: string[]
}

export type TopicTrendPoint = {
  topic: string
  label: string
  date: string
  accuracyPct: number
  sessionIndex: number
}

export type ConceptStat = {
  concept: string
  missCount: number
  questionCount: number
  accuracyPct: number
}

export type TrendInsight = {
  type: 'dip' | 'improvement' | 'weakness' | 'summary' | 'pace'
  title: string
  body: string
  topic?: string
}

export type AnalyticsSnapshot = {
  sessionCount: number
  overallAccuracyPct: number
  sessionTrend: SessionTrendPoint[]
  topicTrends: TopicTrendPoint[]
  topMissedConcepts: ConceptStat[]
  conceptAccuracy: ConceptStat[]
  insights: TrendInsight[]
  topics: string[]
  pastQuestions: PastQuestion[]
}
