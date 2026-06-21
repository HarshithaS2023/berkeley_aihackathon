import { API_BASE } from '../lib/apiBase'
import type {
  AnalyzeWorkRequest,
  Feedback,
  GenerateQuestionRequest,
  Question,
  SessionResult,
  SummaryResponse,
} from '../types'

export type QuizApi = {
  generateQuestion(request: GenerateQuestionRequest): Promise<Question>
  generateQuestions(request: GenerateQuestionRequest, count: number): Promise<Question[]>
  analyzeWork(request: AnalyzeWorkRequest): Promise<Feedback>
  generateSummary(results: SessionResult[]): Promise<SummaryResponse>
}

function buildBatchBody(request: GenerateQuestionRequest, count: number) {
  return {
    topics: request.sourceProfile.topics,
    concepts: request.sourceProfile.concepts,
    style_notes: request.sourceProfile.styleNotes,
    difficulty: request.currentDifficulty,
    problem_type: request.problemType,
    weak_areas: request.weakAreas,
    previous_questions: request.previousQuestions,
    count,
  }
}

export const httpQuizApi: QuizApi = {
  async generateQuestions(request, count) {
    const res = await fetch(`${API_BASE}/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBatchBody(request, count)),
    })
    if (!res.ok) throw new Error(`Question generation failed: ${res.status}`)
    return res.json() as Promise<Question[]>
  },

  async generateQuestion(request) {
    const questions = await httpQuizApi.generateQuestions(request, 1)
    return questions[0]
  },

  async analyzeWork(request) {
    const body: Record<string, unknown> = {
      correct_answer: request.question.answer,
      prior_errors: [],
    }
    if (request.submission.answerText) {
      body.work_text = request.submission.answerText
    } else if (request.submission.whiteboardImageBase64) {
      body.image_base64 = request.submission.whiteboardImageBase64
    } else if (request.submission.uploadedWorkFileBase64) {
      body.image_base64 = request.submission.uploadedWorkFileBase64
    } else {
      body.work_text = '(no answer provided)'
    }

    const res = await fetch(`${API_BASE}/analyze-work`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Work analysis failed: ${res.status}`)
    const data = await res.json()

    const correct: boolean = data.correct ?? false
    return {
      correct,
      score: correct ? 1 : 0.35,
      feedback: data.feedback_text ?? '',
      errorPatterns: !correct && data.conceptual_gap ? [data.conceptual_gap] : [],
      strengths: correct ? ['Correct answer and approach'] : [],
      suggestedNextStep: !correct
        ? (data.conceptual_gap ?? 'Review the relevant concept and try again')
        : 'Try a more challenging variation',
      recommendedDifficulty: request.question.difficulty,
    }
  },

  async generateSummary(results) {
    const correctCount = results.filter((r) => r.feedback.correct).length
    const totalTime = results.reduce((sum, r) => sum + r.submission.responseTimeSeconds, 0)
    const missedConcepts = results.flatMap((r) =>
      r.feedback.correct ? [] : r.question.concepts,
    )

    return {
      accuracy: results.length ? correctCount / results.length : 0,
      averageResponseTimeSeconds: results.length
        ? Math.round(totalTime / results.length)
        : 0,
      mostMissedConcepts: [...new Set(missedConcepts)],
      commonMistakes: [...new Set(results.flatMap((r) => r.feedback.errorPatterns))],
      strengths: [...new Set(results.flatMap((r) => r.feedback.strengths))],
      suggestedNextSteps: [...new Set(results.map((r) => r.feedback.suggestedNextStep))],
    }
  },
}

export const quizApi: QuizApi = httpQuizApi
