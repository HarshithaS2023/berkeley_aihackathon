import { useMemo, useState } from 'react'
import type { PastQuestion } from '../../types/analytics'

type SessionGroup = {
  sessionId: string
  sessionLabel: string
  sessionTopics: string[]
  questions: PastQuestion[]
}

function groupBySession(questions: PastQuestion[]): SessionGroup[] {
  const groups: SessionGroup[] = []
  const indexBySession = new Map<string, number>()

  for (const question of questions) {
    const existingIndex = indexBySession.get(question.sessionId)
    if (existingIndex === undefined) {
      indexBySession.set(question.sessionId, groups.length)
      groups.push({
        sessionId: question.sessionId,
        sessionLabel: question.sessionLabel,
        sessionTopics: question.sessionTopics,
        questions: [question],
      })
    } else {
      groups[existingIndex].questions.push(question)
    }
  }

  return groups
}

function sessionAccuracy(questions: PastQuestion[]): number {
  if (questions.length === 0) return 0
  const correct = questions.filter((item) => item.correct).length
  return Math.round((correct / questions.length) * 1000) / 10
}

export default function PastQuestionsPanel({
  questions,
}: {
  questions: PastQuestion[]
}) {
  const sessions = useMemo(() => groupBySession(questions), [questions])
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set())
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())

  if (questions.length === 0) {
    return (
      <section className="past-questions-empty">
        <p>No saved questions yet. Complete a quiz while signed in to build your history.</p>
      </section>
    )
  }

  const toggleAnswer = (questionId: string) => {
    setExpandedAnswers((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const toggleSession = (sessionId: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  return (
    <section className="past-questions-panel">
      {sessions.map((session) => {
        const accuracy = sessionAccuracy(session.questions)
        const isCollapsed = collapsedSessions.has(session.sessionId)

        return (
          <article className="past-questions-session" key={session.sessionId}>
            <button
              type="button"
              className="past-questions-session-header"
              aria-expanded={!isCollapsed}
              onClick={() => toggleSession(session.sessionId)}
            >
              <div className="past-questions-session-title">
                <h2>{session.sessionLabel}</h2>
                <p>{session.sessionTopics.join(' · ')}</p>
              </div>
              <div className="past-questions-session-meta">
                <span>{session.questions.length} questions</span>
                <span>{accuracy}% correct</span>
                <span className="past-questions-chevron" aria-hidden>
                  {isCollapsed ? '▸' : '▾'}
                </span>
              </div>
            </button>

            {!isCollapsed && (
              <ul className="past-questions-list">
                {session.questions.map((item) => {
                  const showAnswer = expandedAnswers.has(item.id)

                  return (
                    <li className="past-questions-item" key={item.id}>
                      <div className="past-questions-item-head">
                        <span
                          className={`past-questions-badge ${item.correct ? 'correct' : 'incorrect'}`}
                        >
                          {item.correct ? 'Correct' : 'Incorrect'}
                        </span>
                        <span className="past-questions-difficulty">
                          Difficulty {item.difficulty}/5
                        </span>
                      </div>

                      <p className="past-questions-text">{item.question}</p>

                      <div className="past-questions-meta">
                        {item.concepts.length > 0 && (
                          <span>{item.concepts.join(', ')}</span>
                        )}
                        <span>{Math.round(item.timeSpent)}s</span>
                        {item.hintsUsed > 0 && (
                          <span>
                            {item.hintsUsed} hint{item.hintsUsed === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="past-questions-answer-toggle quiz-secondary"
                        aria-expanded={showAnswer}
                        onClick={() => toggleAnswer(item.id)}
                      >
                        {showAnswer ? 'Hide answer' : 'Show answer'}
                      </button>

                      {showAnswer && (
                        <div className="past-questions-answer">
                          <strong>Answer</strong>
                          <p>{item.answer}</p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </article>
        )
      })}
    </section>
  )
}
