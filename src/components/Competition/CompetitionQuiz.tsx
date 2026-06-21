import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetitionStore } from '../../store/competitionStore'
import { useQuizStore } from '../../store/quizStore'
import { useQuestionTimer } from '../../hooks/useQuestionTimer'
import { WorkPanel } from '../WorkPanel/WorkPanel'
import { RivalPanel } from './RivalPanel'
import './Competition.css'

const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function CompetitionQuiz() {
  const navigate = useNavigate()
  const [answerText, setAnswerText] = useState('')

  // Quiz store
  const phase = useQuizStore((s) => s.phase)
  const settings = useQuizStore((s) => s.settings)
  const currentQuestion = useQuizStore((s) => s.currentQuestion)
  const currentDifficulty = useQuizStore((s) => s.currentDifficulty)
  const results = useQuizStore((s) => s.results)
  const elapsedSeconds = useQuizStore((s) => s.elapsedSeconds)
  const visibleHints = useQuizStore((s) => s.visibleHints)
  const hintsUsed = useQuizStore((s) => s.hintsUsed)
  const revealHint = useQuizStore((s) => s.revealHint)
  const submitCurrentQuestion = useQuizStore((s) => s.submitCurrentQuestion)
  const continueQuiz = useQuizStore((s) => s.continueQuiz)

  // Competition store
  const rival = useCompetitionStore((s) => s.rival)
  const updateMyProgress = useCompetitionStore((s) => s.updateMyProgress)
  const onQuizComplete = useCompetitionStore((s) => s.onQuizComplete)
  const compPhase = useCompetitionStore((s) => s.phase)

  useQuestionTimer()

  // Sync progress after each answered question
  useEffect(() => {
    if (phase !== 'feedback') return
    const correctCount = results.filter((r) => r.feedback.correct).length
    const score = correctCount / Math.max(results.length, 1)
    void updateMyProgress(results.length, currentDifficulty, correctCount, score)
  }, [results.length, phase])

  // Handle quiz completion
  useEffect(() => {
    if (phase === 'summary') {
      const correctCount = results.filter((r) => r.feedback.correct).length
      const score = correctCount / Math.max(results.length, 1)
      void onQuizComplete(results, score, correctCount)
    }
    if (phase === 'setup') navigate('/')
    if (phase === 'error') navigate('/error')
  }, [phase])

  // Navigate to results when both are done
  useEffect(() => {
    if (compPhase === 'results') navigate('/compete/results')
    if (compPhase === 'finished') navigate('/compete/results')
  }, [compPhase])

  if (phase === 'generating' || phase === 'submitting' || !currentQuestion) {
    return (
      <main className="comp-quiz-status">
        <div className="spinner" />
        <p>{phase === 'submitting' ? 'Analyzing your work…' : 'Loading next question…'}</p>
      </main>
    )
  }

  const latestFeedback = results.at(-1)?.feedback
  const isFeedback = phase === 'feedback' && latestFeedback
  const isLastQuestion = results.length >= settings.numQuestions
  const displayedQ = phase === 'feedback' ? results.length : results.length + 1
  const safeQ = Math.min(displayedQ, settings.numQuestions)

  return (
    <main className="comp-quiz-layout">
      <div className="comp-quiz-main">
        <header className="comp-quiz-header">
          <div>
            <span className="comp-badge">⚡ Challenge</span>
            <span className="comp-q-counter">Q{safeQ} / {settings.numQuestions}</span>
          </div>
          <div className="comp-quiz-meta">
            <span className="comp-difficulty">Level {currentDifficulty}</span>
            <span className="comp-timer">{formatTime(elapsedSeconds)}</span>
          </div>
        </header>

        <section className="comp-question-card">
          <p className="question-kicker">{currentQuestion.concepts.join(' · ')}</p>
          <h2>{currentQuestion.question}</h2>

          {visibleHints.map((hint) => (
            <p key={hint} className="comp-hint">💡 {hint}</p>
          ))}

          {!isFeedback && (
            <>
              <label className="comp-label">
                Final answer (optional)
                <input
                  className="comp-input"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Your answer"
                />
              </label>

              <WorkPanel
                question={currentQuestion}
                onShowHint={hintsUsed < currentQuestion.hints.length ? () => revealHint() : undefined}
                onSubmitWork={(work) =>
                  void submitCurrentQuestion({ ...work, answerText: answerText.trim() || undefined })
                }
              />
            </>
          )}

          {isFeedback && (
            <div className={`comp-feedback ${latestFeedback.correct ? 'comp-feedback-correct' : 'comp-feedback-wrong'}`}>
              <p className="comp-feedback-verdict">{latestFeedback.correct ? '✓ Correct' : '✗ Keep going'}</p>
              <p>{latestFeedback.feedback}</p>
              <p className="comp-feedback-next">{latestFeedback.suggestedNextStep}</p>
              <button
                className="comp-btn-primary"
                onClick={() => { setAnswerText(''); void continueQuiz() }}
              >
                {isLastQuestion ? 'See results' : 'Next question →'}
              </button>
            </div>
          )}
        </section>
      </div>

      <RivalPanel rival={rival} totalQuestions={settings.numQuestions} />
    </main>
  )
}
