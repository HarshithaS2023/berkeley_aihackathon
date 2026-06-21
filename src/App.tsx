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
import { ReadAloudButton } from './components/Tts/ReadAloudButton'
import { TtsSpeedControl } from './components/Tts/TtsSpeedControl'
import './components/Tts/Tts.css'
import { WorkPanel } from './components/WorkPanel/WorkPanel'
import { useQuestionTimer } from './hooks/useQuestionTimer'
import { useTts } from './hooks/useTts'
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
  const hintsUsed = useQuizStore((state) => state.hintsUsed)
  const streamingFeedback = useQuizStore((state) => state.streamingFeedback)
  const revealHint = useQuizStore((state) => state.revealHint)
  const submitCurrentQuestion = useQuizStore((state) => state.submitCurrentQuestion)
  const continueQuiz = useQuizStore((state) => state.continueQuiz)

  const { speak, stop, prefetch, isTextReady, speed, setSpeed, isSpeaking, isLoading } = useTts()

  useQuestionTimer()

  useEffect(() => {
    if (phase === 'summary') navigate('/summary')
    if (phase === 'setup') navigate('/')
    if (phase === 'error') navigate('/error')
  }, [phase, navigate])

  useEffect(() => {
    if (!currentQuestion || phase === 'feedback') return
    prefetch(currentQuestion.question)
    for (const hint of currentQuestion.hints) {
      prefetch(`Hint: ${hint}`)
    }
  }, [currentQuestion?.id, phase, prefetch, currentQuestion?.question, currentQuestion?.hints])

  useEffect(() => {
    if (phase !== 'feedback') return
    const latest = results.at(-1)?.feedback
    if (!latest) return
    const speech = `${latest.feedback} ${latest.suggestedNextStep}`.trim()
    if (speech) prefetch(speech)
  }, [phase, results, prefetch])

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

  const feedbackSpeech = latestFeedback
    ? `${latestFeedback.feedback} ${latestFeedback.suggestedNextStep}`.trim()
    : ''

  const handleShowHint = () => {
    const nextHint = currentQuestion.hints[hintsUsed]
    revealHint()
    if (nextHint) void speak(`Hint: ${nextHint}`)
  }

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
          <TtsSpeedControl speed={speed} onSpeedChange={setSpeed} disabled={isSpeaking} />
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
              {!isFeedback && (
                <ReadAloudButton
                  text={currentQuestion.question}
                  label="Read question"
                  isSpeaking={isSpeaking}
                  isLoading={isLoading}
                  isPreparing={!isTextReady(currentQuestion.question)}
                  onSpeak={speak}
                  onStop={stop}
                />
              )}
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
                onShowHint={handleShowHint}
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
                {!latestFeedback.correct && (
                  <div className="feedback-details">
                    {latestFeedback.submittedAnswer && (
                      <div>
                        <strong>Your answer</strong>
                        <p>{latestFeedback.submittedAnswer}</p>
                      </div>
                    )}
                    <div>
                      <strong>Correct answer</strong>
                      <p>{latestFeedback.expectedAnswer}</p>
                    </div>
                    {latestFeedback.numericalDifference !== undefined && (
                      <div>
                        <strong>Difference</strong>
                        <p>{latestFeedback.numericalDifference}</p>
                      </div>
                    )}
                    {latestFeedback.firstIncorrectStep && (
                      <div className="feedback-detail-wide">
                        <strong>First step to revisit</strong>
                        <p>{latestFeedback.firstIncorrectStep}</p>
                      </div>
                    )}
                  </div>
                )}
                <p>{latestFeedback.suggestedNextStep}</p>
                {feedbackSpeech && (
                  <ReadAloudButton
                    text={feedbackSpeech}
                    label="Read feedback"
                    isSpeaking={isSpeaking}
                    isLoading={isLoading}
                    isPreparing={!isTextReady(feedbackSpeech)}
                    onSpeak={speak}
                    onStop={stop}
                  />
                )}
              </div>
              <button
                className="quiz-primary"
                type="button"
                onClick={() => { stop(); setAnswerText(''); void continueQuiz() }}
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
