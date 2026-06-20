import { useState } from 'react'
import './App.css'
import { WorkPanel } from './components/WorkPanel/WorkPanel'
import { useQuestionTimer } from './hooks/useQuestionTimer'
import { useQuizStore } from './store/quizStore'

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60,
  ).padStart(2, '0')}`

function EngineDevHarness() {
  const setSourceProfile = useQuizStore((state) => state.setSourceProfile)
  const startQuiz = useQuizStore((state) => state.startQuiz)

  const handleStart = () => {
    // Temporary stand-in for Person 3's upload and Person 1's /analyze-source.
    setSourceProfile({
      topics: ['Rate problems'],
      concepts: ['rates', 'unit conversion', 'algebra'],
      styleNotes: 'Multi-step high-school math word problems.',
    })
    void startQuiz()
  }

  return (
    <main className="shell setup">
      <p className="eyebrow">Role 2 development harness</p>
      <h1>Adaptive quiz engine</h1>
      <p className="lede">
        Starts the quiz flow with temporary source data and the store’s default
        settings. Person 4’s configuration page will replace this screen.
      </p>

      <button className="primary" type="button" onClick={handleStart}>
        Run engine demo
      </button>
    </main>
  )
}

function QuizScreen() {
  const [answerText, setAnswerText] = useState('')
  const phase = useQuizStore((state) => state.phase)
  const settings = useQuizStore((state) => state.settings)
  const currentQuestion = useQuizStore((state) => state.currentQuestion)
  const currentDifficulty = useQuizStore(
    (state) => state.currentDifficulty,
  )
  const results = useQuizStore((state) => state.results)
  const elapsedSeconds = useQuizStore((state) => state.elapsedSeconds)
  const visibleHints = useQuizStore((state) => state.visibleHints)
  const revealHint = useQuizStore((state) => state.revealHint)
  const submitCurrentQuestion = useQuizStore(
    (state) => state.submitCurrentQuestion,
  )
  const continueQuiz = useQuizStore((state) => state.continueQuiz)

  useQuestionTimer()

  if (phase === 'generating') {
    return <StatusScreen message="Generating your next question…" />
  }

  if (phase === 'submitting') {
    return <StatusScreen message="Analyzing your work…" />
  }

  if (!currentQuestion) return null

  const latestFeedback = results.at(-1)?.feedback
  const isFeedback = phase === 'feedback' && latestFeedback
  const isLastQuestion = results.length >= settings.numQuestions
  const displayedQuestionNumber =
    phase === 'feedback' ? results.length : results.length + 1

  const next = () => {
    setAnswerText('')
    void continueQuiz()
  }

  return (
    <main className="shell quiz">
      <header className="quiz-header">
        <span>
          Question {Math.min(displayedQuestionNumber, settings.numQuestions)} of{' '}
          {settings.numQuestions}
        </span>
        <span className="difficulty">Difficulty {currentDifficulty}/3</span>
        <span className="timer">{formatTime(elapsedSeconds)}</span>
      </header>

      <section className="question-card">
        <p className="eyebrow">{currentQuestion.concepts.join(' · ')}</p>
        <h2>{currentQuestion.question}</h2>

        {visibleHints.map((hint) => (
          <p className="hint" key={hint}>
            Hint: {hint}
          </p>
        ))}

        {!isFeedback && (
          <>
            <label>
              Final answer (optional)
              <input
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                placeholder="Enter your answer"
              />
            </label>
            <WorkPanel
              onShowHint={revealHint}
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
          <div
            className={`feedback ${
              latestFeedback.correct ? 'correct' : 'incorrect'
            }`}
          >
            <p className="eyebrow">
              {latestFeedback.correct ? 'Correct' : 'Keep working'}
            </p>
            <h3>{latestFeedback.feedback}</h3>
            <p>{latestFeedback.suggestedNextStep}</p>
            <button className="primary" type="button" onClick={next}>
              {isLastQuestion ? 'View summary' : 'Next question'}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

function SummaryScreen() {
  const summary = useQuizStore((state) => state.summary)
  const resetQuiz = useQuizStore((state) => state.resetQuiz)

  if (!summary) return null

  return (
    <main className="shell setup">
      <p className="eyebrow">Session complete</p>
      <h1>{Math.round(summary.accuracy * 100)}% accuracy</h1>
      <p className="lede">
        Average response time: {summary.averageResponseTimeSeconds} seconds
      </p>
      <div className="summary-grid">
        <SummaryList title="Missed concepts" items={summary.mostMissedConcepts} />
        <SummaryList title="Common mistakes" items={summary.commonMistakes} />
        <SummaryList title="Strengths" items={summary.strengths} />
        <SummaryList title="Next steps" items={summary.suggestedNextSteps} />
      </div>
      <button className="primary" type="button" onClick={resetQuiz}>
        Start another session
      </button>
    </main>
  )
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="summary-card">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>Nothing to report yet.</p>
      )}
    </section>
  )
}

function StatusScreen({ message }: { message: string }) {
  return (
    <main className="shell status">
      <div className="spinner" />
      <h2>{message}</h2>
    </main>
  )
}

function App() {
  const phase = useQuizStore((state) => state.phase)
  const error = useQuizStore((state) => state.error)
  const resetQuiz = useQuizStore((state) => state.resetQuiz)

  if (phase === 'setup') return <EngineDevHarness />
  if (phase === 'summary') return <SummaryScreen />
  if (phase === 'error') {
    return (
      <main className="shell status">
        <h2>Quiz interrupted</h2>
        <p>{error}</p>
        <button className="primary" type="button" onClick={resetQuiz}>
          Return to setup
        </button>
      </main>
    )
  }

  return <QuizScreen />
}

export default App
