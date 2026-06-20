import type {
  AnalyzeWorkRequest,
  Feedback,
  GenerateQuestionRequest,
  SessionResult,
  SummaryResponse,
  Question,
} from '../types'

export type QuizApi = {
  generateQuestion(request: GenerateQuestionRequest): Promise<Question>
  analyzeWork(request: AnalyzeWorkRequest): Promise<Feedback>
  generateSummary(results: SessionResult[]): Promise<SummaryResponse>
}

const pause = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

const mockQuestions = [
  {
    question: 'A car travels 120 miles in 2 hours. What is its average speed?',
    answer: '60 miles per hour',
    solution: 'Average speed = distance ÷ time = 120 ÷ 2 = 60 mph.',
    concepts: ['rates', 'division'],
  },
  {
    question:
      'A runner maintains 8 miles per hour for 45 minutes. How far do they travel?',
    answer: '6 miles',
    solution: '45 minutes is 0.75 hours, so distance = 8 × 0.75 = 6 miles.',
    concepts: ['rates', 'unit conversion'],
  },
  {
    question:
      'Two cyclists start 54 miles apart and ride toward each other at 10 mph and 8 mph. When do they meet?',
    answer: '3 hours',
    solution: 'Their combined rate is 18 mph. Time = 54 ÷ 18 = 3 hours.',
    concepts: ['combined rates', 'algebra'],
  },
]

export const mockQuizApi: QuizApi = {
  async generateQuestion(request) {
    await pause(450)
    const index = Math.min(
      request.previousQuestions.length,
      mockQuestions.length - 1,
    )
    const template = mockQuestions[index]

    return {
      id: crypto.randomUUID(),
      ...template,
      hints: [
        'Identify the quantities and their units.',
        `Use the relationship between ${template.concepts.join(' and ')}.`,
      ],
      difficulty: request.currentDifficulty,
    }
  },

  async analyzeWork(request) {
    await pause(500)
    const normalizedAnswer = request.submission.answerText
      ?.trim()
      .toLowerCase()
    const normalizedExpected = request.question.answer.toLowerCase()
    const correct = Boolean(
      normalizedAnswer &&
        (normalizedExpected.includes(normalizedAnswer) ||
          normalizedAnswer.includes(normalizedExpected)),
    )

    return {
      correct,
      score: correct ? 1 : 0.35,
      feedback: correct
        ? 'Correct. Your answer matches the expected result.'
        : `Not quite. The expected answer is ${request.question.answer}.`,
      errorPatterns: correct ? [] : ['Check the relationship between units.'],
      strengths: correct ? ['Selected the correct operation.'] : [],
      suggestedNextStep: correct
        ? 'Try a problem with one additional reasoning step.'
        : 'Write the relevant formula before substituting values.',
      recommendedDifficulty: request.question.difficulty,
    }
  },

  async generateSummary(results) {
    await pause(350)
    const correctCount = results.filter(
      (result) => result.feedback.correct,
    ).length
    const totalTime = results.reduce(
      (sum, result) => sum + result.submission.responseTimeSeconds,
      0,
    )
    const missedConcepts = results.flatMap((result) =>
      result.feedback.correct ? [] : result.question.concepts,
    )

    return {
      accuracy: results.length ? correctCount / results.length : 0,
      averageResponseTimeSeconds: results.length
        ? Math.round(totalTime / results.length)
        : 0,
      mostMissedConcepts: [...new Set(missedConcepts)],
      commonMistakes: [
        ...new Set(
          results.flatMap((result) => result.feedback.errorPatterns),
        ),
      ],
      strengths: [
        ...new Set(results.flatMap((result) => result.feedback.strengths)),
      ],
      suggestedNextSteps: [
        ...new Set(
          results.map((result) => result.feedback.suggestedNextStep),
        ),
      ],
    }
  },
}

// Person 1 can replace this export with an HTTP-backed implementation
// without changing the store or UI.
export const quizApi: QuizApi = mockQuizApi
