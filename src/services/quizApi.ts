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

async function getApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { detail?: string }
    return data.detail ? `${fallback}: ${data.detail}` : `${fallback}: ${response.status}`
  } catch {
    return `${fallback}: ${response.status}`
  }
}

function assertQuestions(value: unknown): asserts value is Question[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof item.question !== 'string' ||
        !Array.isArray(item.hints) ||
        !Array.isArray(item.concepts),
    )
  ) {
    throw new Error('The question API returned an unexpected response.')
  }
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
    let res: Response

    try {
      res = await fetch(`${API_BASE}/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBatchBody(request, count)),
      })
    } catch {
      throw new Error(
        'Cannot reach the quiz backend at localhost:3001. Start the backend and try again.',
      )
    }

    if (!res.ok) {
      throw new Error(await getApiError(res, 'Question generation failed'))
    }

    const data: unknown = await res.json()
    assertQuestions(data)
    return data
  },

  async generateQuestion(request) {
    const questions = await httpQuizApi.generateQuestions(request, 1)
    return questions[0]
  },

  async analyzeWork(request) {
    const body: Record<string, unknown> = {
      question: request.question.question,
      correct_answer: request.question.answer,
      expected_solution: request.question.solution,
      work_text: request.submission.answerText,
      prior_errors: request.priorErrorPatterns,
    }
    if (request.submission.whiteboardImageBase64) {
      body.image_base64 = request.submission.whiteboardImageBase64
    } else if (request.submission.uploadedWorkFileBase64) {
      body.image_base64 = request.submission.uploadedWorkFileBase64
    } else if (!request.submission.answerText) {
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
    const conceptualGap: string = data.conceptual_gap ?? ''
    const firstIncorrectStep: string = data.first_incorrect_step ?? ''
    return {
      correct,
      score: correct ? 1 : 0.35,
      feedback: data.feedback_text ?? '',
      submittedAnswer: data.submitted_answer || request.submission.answerText,
      expectedAnswer: data.expected_answer ?? request.question.answer,
      numericalDifference:
        typeof data.numerical_difference === 'number'
          ? data.numerical_difference
          : undefined,
      firstIncorrectStep: firstIncorrectStep || undefined,
      conceptualGap: conceptualGap || undefined,
      repeatedPattern: data.is_repeated_pattern ?? false,
      errorPatterns: !correct
        ? [conceptualGap, firstIncorrectStep].filter(Boolean)
        : [],
      strengths: correct ? ['Correct answer and approach'] : [],
      suggestedNextStep: !correct
        ? (conceptualGap || 'Review the relevant concept and try again')
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
