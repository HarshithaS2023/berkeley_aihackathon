import { API_BASE } from '../lib/apiBase'
import type {
  AnalyzeWorkStreamDone,
  AnalyzeWorkRequest,
  Feedback,
  GenerateQuestionRequest,
  LivePeekResponse,
  Question,
  SessionResult,
  SummaryResponse,
} from '../types'

export type QuizApi = {
  generateQuestion(request: GenerateQuestionRequest): Promise<Question>
  generateQuestions(request: GenerateQuestionRequest, count: number): Promise<Question[]>
  warmQuestionQueue(
    sessionId: string,
    request: GenerateQuestionRequest,
    totalNeeded: number,
  ): Promise<void>
  dequeueQuestion(sessionId: string): Promise<Question | null>
  refillQuestionQueue(
    sessionId: string,
    request: GenerateQuestionRequest,
    remaining: number,
  ): Promise<void>
  livePeek(
    imageBase64: string,
    question: string,
    correctAnswer?: string,
  ): Promise<LivePeekResponse>
  analyzeWork(request: AnalyzeWorkRequest): Promise<Feedback>
  analyzeWorkStream(
    request: AnalyzeWorkRequest,
    onDelta: (text: string) => void,
  ): Promise<Feedback>
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

function buildAnalyzeWorkBody(request: AnalyzeWorkRequest) {
  const body: Record<string, unknown> = {
    question: request.question.question,
    correct_answer: request.question.answer,
    expected_solution: request.question.solution,
    prior_errors: request.priorErrorPatterns,
  }
  if (request.submission.answerText) {
    body.work_text = request.submission.answerText
  }
  if (request.submission.whiteboardImageBase64) {
    body.image_base64 = request.submission.whiteboardImageBase64
  } else if (request.submission.uploadedWorkFileBase64) {
    body.image_base64 = request.submission.uploadedWorkFileBase64
  }
  if (!body.work_text && !body.image_base64) {
    body.work_text = '(no answer provided)'
  }
  return body
}

function mapWorkAnalysis(data: AnalyzeWorkStreamDone, request: AnalyzeWorkRequest): Feedback {
  const correct = data.correct ?? false
  const conceptualGap = data.conceptual_gap ?? ''
  const firstIncorrectStep = data.first_incorrect_step ?? ''
  const concepts = request.question.concepts.join(', ') || 'this concept'
  const specificStrength =
    data.strength?.trim() ||
    `Correctly applied ${concepts} on a level ${request.question.difficulty} question.`
  const specificNextStep =
    data.next_step?.trim() ||
    (correct
      ? `Try a level ${Math.min(5, request.question.difficulty + 1)} problem using ${concepts}.`
      : `Redo a similar ${concepts} problem and check each step against the expected method.`)
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
    strengths: correct ? [specificStrength] : [],
    suggestedNextStep: specificNextStep,
    recommendedDifficulty: request.question.difficulty,
  }
}

function parseSseBlock(block: string) {
  let event = 'message'
  const data: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trim())
  }

  return { event, data: data.join('\n') }
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
        `Cannot reach the quiz backend at ${API_BASE}. Start the backend and try again.`,
      )
    }

    if (!res.ok) {
      throw new Error(await getApiError(res, 'Question generation failed'))
    }

    const data: unknown = await res.json()
    assertQuestions(data)
    return data
  },

  async warmQuestionQueue(sessionId, request, totalNeeded) {
    await fetch(`${API_BASE}/question-queue/warm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildBatchBody(request, Math.min(3, Math.max(1, totalNeeded))),
        session_id: sessionId,
        total_needed: totalNeeded,
      }),
    })
  },

  async dequeueQuestion(sessionId) {
    const res = await fetch(`${API_BASE}/question-queue/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    if (res.status === 204 || res.status === 404) return null
    if (!res.ok) throw new Error(await getApiError(res, 'Question queue failed'))

    const data: unknown = await res.json()
    assertQuestions([data])
    return data as Question
  },

  async refillQuestionQueue(sessionId, request, remaining) {
    if (remaining <= 0) return
    await fetch(`${API_BASE}/question-queue/refill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildBatchBody(request, Math.min(3, Math.max(1, remaining))),
        session_id: sessionId,
        remaining,
      }),
    })
  },

  async generateQuestion(request) {
    const questions = await httpQuizApi.generateQuestions(request, 1)
    return questions[0]
  },

  async livePeek(imageBase64, question, correctAnswer) {
    const res = await fetch(`${API_BASE}/live-peek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        question,
        correct_answer: correctAnswer,
      }),
    })
    if (!res.ok) throw new Error(await getApiError(res, 'Live peek failed'))
    return res.json()
  },

  async analyzeWork(request) {
    const res = await fetch(`${API_BASE}/analyze-work`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAnalyzeWorkBody(request)),
    })
    if (!res.ok) throw new Error(`Work analysis failed: ${res.status}`)
    const data = await res.json()

    return mapWorkAnalysis(data, request)
  },

  async analyzeWorkStream(request, onDelta) {
    const res = await fetch(`${API_BASE}/analyze-work/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAnalyzeWorkBody(request)),
    })
    if (!res.ok || !res.body) {
      return httpQuizApi.analyzeWork(request)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalPayload: AnalyzeWorkStreamDone | null = null

    const handleBlock = (block: string) => {
      const { event, data } = parseSseBlock(block)
      if (!data) return
      const parsed = JSON.parse(data)
      if (event === 'delta') {
        onDelta(String(parsed.text ?? ''))
      } else if (event === 'done') {
        finalPayload = parsed as AnalyzeWorkStreamDone
      } else if (event === 'error') {
        throw new Error(String(parsed.detail ?? 'Streaming analysis failed.'))
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })

      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) handleBlock(block)

      if (done) break
    }

    if (buffer.trim()) handleBlock(buffer)
    if (!finalPayload) throw new Error('Streaming analysis ended without final feedback.')

    return mapWorkAnalysis(finalPayload, request)
  },

  async generateSummary(results) {
    const correctCount = results.filter((r) => r.feedback.correct).length
    const totalTime = results.reduce((sum, r) => sum + r.submission.responseTimeSeconds, 0)
    const missedConcepts = results.flatMap((r) =>
      r.feedback.correct ? [] : r.question.concepts,
    )

    const commonMistakes = results.flatMap((result) => {
      if (result.feedback.correct) return []
      const concepts = result.question.concepts.join(', ') || 'this concept'
      if (result.feedback.firstIncorrectStep) {
        return [
          `While working on ${concepts}, the first step to revisit was: ${result.feedback.firstIncorrectStep}`,
        ]
      }
      if (result.feedback.conceptualGap) {
        return [`For ${concepts}: ${result.feedback.conceptualGap}`]
      }
      return result.feedback.errorPatterns.map(
        (pattern) => `For ${concepts}: ${pattern}`,
      )
    })
    const strengths = results.flatMap((result) => {
      if (!result.feedback.correct) return []
      const concepts = result.question.concepts.join(', ') || 'the target concept'
      const specific = result.feedback.strengths.filter(
        (strength) => strength !== 'Correct answer and approach',
      )
      return specific.length > 0
        ? specific
        : [
            `Correctly solved a level ${result.question.difficulty} question involving ${concepts}, showing a sound approach through to the final answer.`,
          ]
    })
    const suggestedNextSteps = results.map((result) => {
      const concepts = result.question.concepts.join(', ') || 'this concept'
      const suggestion = result.feedback.suggestedNextStep
      if (
        suggestion &&
        suggestion !== 'Try a more challenging variation' &&
        suggestion !== 'Review the relevant concept and try again'
      ) {
        return suggestion
      }
      return result.feedback.correct
        ? `Practice a level ${Math.min(5, result.question.difficulty + 1)} variation using ${concepts}, with one extra reasoning step.`
        : `Redo a similar ${concepts} problem, explicitly checking the step where your work first diverged before calculating the final answer.`
    })

    return {
      accuracy: results.length ? correctCount / results.length : 0,
      averageResponseTimeSeconds: results.length
        ? Math.round(totalTime / results.length)
        : 0,
      mostMissedConcepts: [...new Set(missedConcepts)],
      commonMistakes: [...new Set(commonMistakes)],
      strengths: [...new Set(strengths)],
      suggestedNextSteps: [...new Set(suggestedNextSteps)],
    }
  },
}

export const quizApi: QuizApi = httpQuizApi
