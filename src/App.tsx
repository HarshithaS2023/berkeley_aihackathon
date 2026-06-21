import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import './App.css'
import lambMascot from './assets/lamb-mascot.png'
import HomePage from './components/HomePage'
import SummaryPage from './components/SummaryPage'
import { WorkPanel } from './components/WorkPanel/WorkPanel'
import { useQuestionTimer } from './hooks/useQuestionTimer'
import { useQuizStore } from './store/quizStore'

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60,
  ).padStart(2, '0')}`

function StatusScreen({ message }: { message: string }) {
  return (
    <main className="quiz-status">
      <img src={lambMascot} alt="" />
      <div className="spinner" />
      <h2>{message}</h2>
      <p>Learn+Grow is getting everything ready.</p>
    </main>
  )
}

function StreamingFeedbackScreen({ text }: { text: string | null }) {
  const visibleText = text?.trim()

  return (
    <main className="quiz-status streaming-status">
      <img src={lambMascot} alt="" />
      <div className="spinner" />
      <h2>Reviewing your work…</h2>
      <div className="streaming-feedback">
        <span>Live feedback</span>
        <p>{visibleText || 'Reading your work and checking the reasoning…'}</p>
      </div>
    </main>
  )
}

function QuizScreen() {
  const [answerText, setAnswerText] = useState('')
  const navigate = useNavigate()

  const phase = useQuizStore((state) => state.phase)
  const settings = useQuizStore((state) => state.settings)
  const currentQuestion = useQuizStore((state) => state.currentQuestion)
  const currentDifficulty = useQuizStore((state) => state.currentDifficulty)
  const results = useQuizStore((state) => state.results)
  const elapsedSeconds = useQuizStore((state) => state.elapsedSeconds)
  const visibleHints = useQuizStore((state) => state.visibleHints)
  const streamingFeedback = useQuizStore((state) => state.streamingFeedback)
  const revealHint = useQuizStore((state) => state.revealHint)
  const submitCurrentQuestion = useQuizStore((state) => state.submitCurrentQuestion)
  const continueQuiz = useQuizStore((state) => state.continueQuiz)

  useQuestionTimer()

  useEffect(() => {
    if (phase === 'summary') navigate('/summary')
    if (phase === 'setup') navigate('/')
    if (phase === 'error') navigate('/error')
  }, [phase, navigate])

  if (phase === 'generating') {
    return <StatusScreen message="Growing your next question…" />
  }
  if (phase === 'submitting') {
    return <StreamingFeedbackScreen text={streamingFeedback} />
  }
  if (!currentQuestion) {
    return <StatusScreen message="Preparing your quiz…" />
  }

  const latestFeedback = results.at(-1)?.feedback
  const isFeedback = phase === 'feedback' && latestFeedback
  const isLastQuestion = results.length >= settings.numQuestions
  const displayedQuestionNumber =
    phase === 'feedback' ? results.length : results.length + 1
  const safeQuestionNumber = Math.min(displayedQuestionNumber, settings.numQuestions)
  const progress = (safeQuestionNumber / settings.numQuestions) * 100

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
            <small>Adaptive practice</small>
          </span>
        </button>

        <div className="quiz-nav-progress">
          <span>
            Question {safeQuestionNumber} of {settings.numQuestions}
          </span>
          <div>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="quiz-meta">
          <span className="difficulty">
            <i />
            Level {currentDifficulty}
          </span>
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
        <section className="question-card">
          <div className="question-heading">
            <div className="question-number">
              {String(safeQuestionNumber).padStart(2, '0')}
            </div>
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
                <span>
                  Final answer <small>optional</small>
                </span>
                <input
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  placeholder="Type your final answer here"
                />
              </label>
              <WorkPanel
                question={currentQuestion}
                onShowHint={revealHint}
                onSubmitWork={(work) =>
                  void submitCurrentQuestion({
                    ...work,
                    answerText: answerText.trim() || undefined,
                  })
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
      </div>
    </main>
  )
}

function ErrorScreen() {
  const error = useQuizStore((state) => state.error)
  const resetQuiz = useQuizStore((state) => state.resetQuiz)
  const navigate = useNavigate()
  return (
    <main className="quiz-status error-status">
      <img src={lambMascot} alt="" />
      <h2>Something went wrong</h2>
      <p>{error}</p>
      <button
        className="quiz-primary"
        type="button"
        onClick={() => { resetQuiz(); navigate('/') }}
      >
        Start over
      </button>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-full">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/quiz" element={<QuizScreen />} />
          <Route path="/error" element={<ErrorScreen />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
