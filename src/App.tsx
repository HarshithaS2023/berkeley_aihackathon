import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import HomePage from './components/HomePage'
import SummaryPage from './components/SummaryPage'
import { WorkPanel } from './components/WorkPanel/WorkPanel'
import { useQuizStore } from './store/quizStore'
import { useQuestionTimer } from './hooks/useQuestionTimer'

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function StatusScreen({ message }: { message: string }) {
  return (
    <main className="shell status">
      <div className="spinner" />
      <h2>{message}</h2>
    </main>
  )
}

function QuizScreen() {
  const [answerText, setAnswerText] = useState('')
  const navigate = useNavigate()

  const phase = useQuizStore((s) => s.phase)
  const settings = useQuizStore((s) => s.settings)
  const currentQuestion = useQuizStore((s) => s.currentQuestion)
  const currentDifficulty = useQuizStore((s) => s.currentDifficulty)
  const results = useQuizStore((s) => s.results)
  const elapsedSeconds = useQuizStore((s) => s.elapsedSeconds)
  const visibleHints = useQuizStore((s) => s.visibleHints)
  const revealHint = useQuizStore((s) => s.revealHint)
  const submitCurrentQuestion = useQuizStore((s) => s.submitCurrentQuestion)
  const continueQuiz = useQuizStore((s) => s.continueQuiz)

  useQuestionTimer()

  useEffect(() => {
    if (phase === 'summary') navigate('/summary')
    if (phase === 'setup') navigate('/')
  }, [phase, navigate])

  if (phase === 'generating') return <StatusScreen message="Generating your next question…" />
  if (phase === 'submitting') return <StatusScreen message="Analyzing your work…" />
  if (!currentQuestion) return null

  const latestFeedback = results.at(-1)?.feedback
  const isFeedback = phase === 'feedback' && latestFeedback
  const isLastQuestion = results.length >= settings.numQuestions
  const displayedQuestionNumber = phase === 'feedback' ? results.length : results.length + 1

  return (
    <main className="shell quiz">
      <header className="quiz-header">
        <span>
          Question {Math.min(displayedQuestionNumber, settings.numQuestions)} of {settings.numQuestions}
        </span>
        <span className="difficulty">Difficulty {currentDifficulty}/5</span>
        <span className="timer">{formatTime(elapsedSeconds)}</span>
      </header>

      <section className="question-card">
        <p className="eyebrow">{currentQuestion.concepts.join(' · ')}</p>
        <h2>{currentQuestion.question}</h2>

        {visibleHints.map((hint) => (
          <p className="hint" key={hint}>Hint: {hint}</p>
        ))}

        {!isFeedback && (
          <>
            <label>
              Final answer (optional)
              <input
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Enter your answer"
              />
            </label>
            <WorkPanel
              onShowHint={revealHint}
              submitting={phase === 'submitting'}
              onSubmitWork={(work) =>
                void submitCurrentQuestion({
                  ...work,
                  answerText: answerText.trim() || undefined,
                })
              }
            />
          </>
        )}

        {isFeedback && (
          <div className={`feedback ${latestFeedback.correct ? 'correct' : 'incorrect'}`}>
            <p className="eyebrow">{latestFeedback.correct ? 'Correct' : 'Keep working'}</p>
            <h3>{latestFeedback.feedback}</h3>
            <p>{latestFeedback.suggestedNextStep}</p>
            <button
              className="primary"
              type="button"
              onClick={() => { setAnswerText(''); void continueQuiz() }}
            >
              {isLastQuestion ? 'View summary' : 'Next question'}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function ErrorScreen() {
  const error = useQuizStore((s) => s.error)
  const resetQuiz = useQuizStore((s) => s.resetQuiz)
  const navigate = useNavigate()
  return (
    <main className="shell status">
      <h2>Something went wrong</h2>
      <p>{error}</p>
      <button className="primary" type="button" onClick={() => { resetQuiz(); navigate('/') }}>
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
