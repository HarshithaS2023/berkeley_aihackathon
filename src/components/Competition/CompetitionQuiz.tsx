import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetitionStore } from '../../store/competitionStore'
import { useQuizStore } from '../../store/quizStore'
import { useQuestionTimer } from '../../hooks/useQuestionTimer'
import { WorkPanel } from '../WorkPanel/WorkPanel'
import { RivalPanel } from './RivalPanel'
import lambMascot from '../../assets/lamb-mascot.png'
import './Competition.css'

const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function CompetitionQuiz() {
  const navigate = useNavigate()
  const [answerText, setAnswerText] = useState('')
  const quizStarted = useRef(false)

  const session = useCompetitionStore((s) => s.session)
  const compPhase = useCompetitionStore((s) => s.phase)
  const rival = useCompetitionStore((s) => s.rival)
  const updateMyProgress = useCompetitionStore((s) => s.updateMyProgress)
  const onQuizComplete = useCompetitionStore((s) => s.onQuizComplete)

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
  const setSourceProfile = useQuizStore((s) => s.setSourceProfile)
  const setSettings = useQuizStore((s) => s.setSettings)
  const startPreloadedQuiz = useQuizStore((s) => s.startPreloadedQuiz)

  useQuestionTimer()

  useEffect(() => {
    if (!session) { navigate('/compete'); return }
    if (quizStarted.current) return
    if (compPhase !== 'quiz' && compPhase !== 'finished') return
    quizStarted.current = true
    setSourceProfile(session.sourceProfile)
    setSettings(session.settings)
    void startPreloadedQuiz(session.questions)
  }, [session, compPhase, navigate, setSourceProfile, setSettings, startPreloadedQuiz])

  useEffect(() => {
    if (phase !== 'feedback') return
    const correctCount = results.filter((r) => r.feedback.correct).length
    const score = correctCount / Math.max(results.length, 1)
    void updateMyProgress(results.length, currentDifficulty, correctCount, score)
  }, [results.length, phase, currentDifficulty, updateMyProgress, results])

  useEffect(() => {
    if (phase === 'summary') {
      const correctCount = results.filter((r) => r.feedback.correct).length
      const score = correctCount / Math.max(results.length, 1)
      void onQuizComplete(results, score, correctCount)
    }
    if (phase === 'error') navigate('/error')
  }, [phase, results, onQuizComplete, navigate])

  useEffect(() => {
    if (compPhase === 'results') navigate('/compete/results')
  }, [compPhase, navigate])

  if (!session || (phase === 'setup' && !quizStarted.current)) {
    return (
      <main className="quiz-status">
        <img src={lambMascot} alt="" />
        <div className="spinner" />
        <h2>Starting challenge…</h2>
        <p>Learn+Grow is getting everything ready.</p>
      </main>
    )
  }

  if (compPhase === 'finished') {
    return (
      <main className="quiz-status">
        <img src={lambMascot} alt="" />
        <div className="spinner" />
        <h2>Waiting for {rival?.userName ?? 'your opponent'} to finish…</h2>
        <p>You're done! Hang tight while they complete their challenge.</p>
      </main>
    )
  }

  if (phase === 'generating' || phase === 'submitting' || !currentQuestion) {
    return (
      <main className="quiz-status">
        <img src={lambMascot} alt="" />
        <div className="spinner" />
        <h2>{phase === 'submitting' ? 'Analyzing your work…' : 'Growing your next question…'}</h2>
        <p>Learn+Grow is getting everything ready.</p>
      </main>
    )
  }

  const latestFeedback = results.at(-1)?.feedback
  const isFeedback = phase === 'feedback' && latestFeedback
  const isLastQuestion = results.length >= settings.numQuestions
  const displayedQ = phase === 'feedback' ? results.length : results.length + 1
  const safeQ = Math.min(displayedQ, settings.numQuestions)

  return (
    <main className="quiz-page">
      <header className="quiz-nav">
        <button
          type="button"
          className="quiz-brand"
          onClick={() => navigate('/')}
          aria-label="Return home"
        >
          <img src={lambMascot} alt="" />
          <span>
            <strong>Learn+Grow</strong>
            <small>⚡ Challenge mode</small>
          </span>
        </button>

        <div className="quiz-nav-progress">
          <span>Question {safeQ} of {settings.numQuestions}</span>
          <div><i style={{ width: `${(safeQ / settings.numQuestions) * 100}%` }} /></div>
        </div>

        <div className="quiz-meta">
          <span className="difficulty"><i />Level {currentDifficulty}</span>
          <span className="timer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 1.5M9 3h6" />
            </svg>
            {formatTime(elapsedSeconds)}
          </span>
        </div>
      </header>

      <div className="quiz-shell">
        <div className="comp-quiz-with-rival">
          <section className="question-card">
            <div className="question-heading">
              <div className="question-number">{String(safeQ).padStart(2, '0')}</div>
              <div className="question-content">
                <p className="question-kicker">
                  {currentQuestion.concepts.join(' · ') || 'Practice question'}
                </p>
                <h1>{currentQuestion.question}</h1>
              </div>
            </div>

            {visibleHints.map((hint) => (
              <div className="hint" key={hint}>
                <span>✦</span>
                <div>
                  <strong>A gentle nudge</strong>
                  <p>{hint}</p>
                </div>
              </div>
            ))}

            {!isFeedback && (
              <div className="quiz-answer-area">
                <label className="final-answer">
                  <span>Final answer <small>optional</small></span>
                  <input
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Type your final answer here"
                  />
                </label>
                <WorkPanel
                  question={currentQuestion}
                  onShowHint={hintsUsed < currentQuestion.hints.length ? () => revealHint() : undefined}
                  onSubmitWork={(work) =>
                    void submitCurrentQuestion({ ...work, answerText: answerText.trim() || undefined })
                  }
                />
              </div>
            )}

            {isFeedback && (
              <div className={`feedback ${latestFeedback.correct ? 'correct' : 'incorrect'}`}>
                <div className="feedback-icon">
                  {latestFeedback.correct ? '✓' : '↗'}
                </div>
                <div className="feedback-copy">
                  <span>{latestFeedback.correct ? 'Nicely done' : "Let's refine it"}</span>
                  <h2>{latestFeedback.feedback}</h2>
                  <p>{latestFeedback.suggestedNextStep}</p>
                </div>
                <button
                  className="quiz-primary"
                  type="button"
                  onClick={() => { setAnswerText(''); void continueQuiz() }}
                >
                  {isLastQuestion ? 'View summary' : 'Next question'}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </section>

          <RivalPanel rival={rival} totalQuestions={settings.numQuestions} />
        </div>
      </div>
    </main>
  )
}
