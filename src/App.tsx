import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import HomePage from './components/HomePage'
import SummaryPage from './components/SummaryPage'
import { ReadAloudButton } from './components/Tts/ReadAloudButton'
import { TtsSpeedControl } from './components/Tts/TtsSpeedControl'
import { WorkPanel } from './components/WorkPanel/WorkPanel'
import { useQuizStore } from './store/quizStore'
import { useQuestionTimer } from './hooks/useQuestionTimer'
import { useTts } from './hooks/useTts'
import './components/Tts/Tts.css'

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
  const hintsUsed = useQuizStore((s) => s.hintsUsed)
  const revealHint = useQuizStore((s) => s.revealHint)
  const submitCurrentQuestion = useQuizStore((s) => s.submitCurrentQuestion)
  const continueQuiz = useQuizStore((s) => s.continueQuiz)
  const { speak, stop, prefetch, speed, setSpeed, isSpeaking, isLoading, error: ttsError } = useTts()

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

  if (phase === 'generating') return <StatusScreen message="Generating your next question…" />
  if (phase === 'submitting') return <StatusScreen message="Analyzing your work…" />
  if (!currentQuestion) {
    return <StatusScreen message="Preparing your quiz…" />
  }

  const latestFeedback = results.at(-1)?.feedback
  const isFeedback = phase === 'feedback' && latestFeedback
  const isLastQuestion = results.length >= settings.numQuestions
  const displayedQuestionNumber = phase === 'feedback' ? results.length : results.length + 1

  const feedbackSpeech = latestFeedback
    ? `${latestFeedback.feedback} ${latestFeedback.suggestedNextStep}`.trim()
    : ''

  const handleShowHint = () => {
    const nextHint = currentQuestion.hints[hintsUsed]
    revealHint()
    if (nextHint) {
      void speak(`Hint: ${nextHint}`)
    }
  }

  const hintSpeech = (hint: string) => `Hint: ${hint}`

  const next = () => {
    stop()
    setAnswerText('')
    void continueQuiz()
  }

  return (
    <main className="shell quiz">
      <header className="quiz-header">
        <div className="quiz-header-meta">
          <span>
            Question {Math.min(displayedQuestionNumber, settings.numQuestions)} of{' '}
            {settings.numQuestions}
          </span>
          <span className="difficulty">Difficulty {currentDifficulty}/5</span>
        </div>
        <div className="quiz-header-controls">
          <span className="timer">{formatTime(elapsedSeconds)}</span>
          <TtsSpeedControl speed={speed} onSpeedChange={setSpeed} disabled={isSpeaking} />
        </div>
      </header>

      <section className="question-card">
        <p className="eyebrow">{currentQuestion.concepts.join(' · ')}</p>
        <div className="tts-row">
          <h2>{currentQuestion.question}</h2>
          {!isFeedback && (
            <ReadAloudButton
              text={currentQuestion.question}
              label="Read question"
              isSpeaking={isSpeaking}
              isLoading={isLoading}
              onSpeak={speak}
              onStop={stop}
            />
          )}
        </div>

        {ttsError && <p className="tts-error">{ttsError}</p>}

        {visibleHints.map((hint) => (
          <div className="tts-row hint-row" key={hint}>
            <p className="hint">Hint: {hint}</p>
            <ReadAloudButton
              text={hintSpeech(hint)}
              label="Read hint"
              isSpeaking={isSpeaking}
              isLoading={isLoading}
              onSpeak={speak}
              onStop={stop}
            />
          </div>
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
              onShowHint={handleShowHint}
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
            <div className="tts-row">
              <h3>{latestFeedback.feedback}</h3>
              <ReadAloudButton
                text={feedbackSpeech}
                label="Read feedback"
                isSpeaking={isSpeaking}
                isLoading={isLoading}
                onSpeak={speak}
                onStop={stop}
              />
            </div>
            <p>{latestFeedback.suggestedNextStep}</p>
            <button
              className="primary"
              type="button"
              onClick={next}
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
