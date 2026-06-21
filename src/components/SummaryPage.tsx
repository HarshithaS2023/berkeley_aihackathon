import { useNavigate } from 'react-router-dom'
import lambMascot from '../assets/lamb-mascot.png'
import { useQuizStore } from '../store/quizStore'
import type { Difficulty, SummaryResponse } from '../types'
import './SummaryPage.css'

const MOCK_SUMMARY: SummaryResponse = {
  accuracy: 0.72,
  averageResponseTimeSeconds: 95,
  mostMissedConcepts: ['Chain rule', 'Negative exponents'],
  commonMistakes: [
    'Sign errors when distributing negative terms',
    'Forgetting to apply the chain rule on composite functions',
  ],
  strengths: [
    'Solid grasp of the basic power rule',
    'Clean algebraic manipulation',
  ],
  suggestedNextSteps: [
    'Do 5 chain-rule problems focusing on trig compositions',
    'Review sign distribution with parentheses',
    'Practice quotient rule with rational functions',
  ],
}

const MOCK_DIFFICULTIES: Difficulty[] = [2, 2, 3, 3, 4]
const difficultyLabels = ['Very easy', 'Easy', 'Medium', 'Hard', 'Very hard']

function ScoreRing({ accuracy }: { accuracy: number }) {
  const score = Math.round(accuracy * 100)
  const radius = 45
  const circumference = 2 * Math.PI * radius

  return (
    <div className="summary-score-ring">
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle className="score-ring-track" cx="55" cy="55" r={radius} />
        <circle
          className="score-ring-value"
          cx="55"
          cy="55"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - accuracy)}
        />
      </svg>
      <div>
        <strong>{score}%</strong>
        <span>accuracy</span>
      </div>
    </div>
  )
}

function DifficultyChart({ values }: { values: Difficulty[] }) {
  const width = 720
  const height = 240
  const padding = { top: 22, right: 24, bottom: 40, left: 54 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const xFor = (index: number) =>
    padding.left +
    (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth)
  const yFor = (difficulty: Difficulty) =>
    padding.top + ((5 - difficulty) / 4) * plotHeight
  const points = values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ')

  return (
    <div className="difficulty-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Question difficulty over time: ${values.join(', ')}`}
      >
        {[1, 2, 3, 4, 5].map((level) => {
          const y = yFor(level as Difficulty)
          return (
            <g key={level}>
              <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="chart-y-label" x={padding.left - 13} y={y + 4}>
                {level}
              </text>
            </g>
          )
        })}
        <polyline className="chart-line-shadow" points={points} />
        <polyline className="chart-line" points={points} />
        {values.map((value, index) => (
          <g key={`${index}-${value}`}>
            <circle className="chart-point-halo" cx={xFor(index)} cy={yFor(value)} r="9" />
            <circle className="chart-point" cx={xFor(index)} cy={yFor(value)} r="5" />
            <text className="chart-x-label" x={xFor(index)} y={height - 13}>
              Q{index + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span><i /> Question difficulty</span>
        <span>1 = very easy · 5 = very hard</span>
      </div>
    </div>
  )
}

function InsightList({
  items,
  emptyText,
  tone,
}: {
  items: string[]
  emptyText: string
  tone: 'positive' | 'warning' | 'next'
}) {
  if (items.length === 0) {
    return <p className="summary-empty">{emptyText}</p>
  }

  return (
    <ul className={`summary-insight-list ${tone}`}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>
          <span>{tone === 'positive' ? '✓' : tone === 'warning' ? '!' : index + 1}</span>
          <p>{item}</p>
        </li>
      ))}
    </ul>
  )
}

export default function SummaryPage() {
  const navigate = useNavigate()
  const storedSummary = useQuizStore((state) => state.summary)
  const results = useQuizStore((state) => state.results)
  const resetQuiz = useQuizStore((state) => state.resetQuiz)
  const summary = storedSummary ?? MOCK_SUMMARY
  const difficultyHistory =
    results.length > 0
      ? results.map((result) => result.question.difficulty)
      : MOCK_DIFFICULTIES
  const finalDifficulty = difficultyHistory.at(-1) ?? 1

  const handleNewSession = () => {
    resetQuiz()
    navigate('/')
  }

  return (
    <main className="summary-page">
      <div className="summary-glow summary-glow-one" />
      <div className="summary-glow summary-glow-two" />

      <header className="summary-nav">
        <button type="button" className="summary-brand" onClick={handleNewSession}>
          <img src={lambMascot} alt="" />
          <span>
            <strong>Learn+Grow</strong>
            <small>Adaptive study partner</small>
          </span>
        </button>
        <span className="summary-nav-label">Session analytics</span>
      </header>

      <div className="summary-shell">
        <section className="summary-hero">
          <div>
            <span className="summary-eyebrow">Practice complete</span>
            <h1>Here’s how you grew.</h1>
            <p>
              Your session patterns, strongest concepts, and best next steps—all
              in one place.
            </p>
          </div>
          <img src={lambMascot} alt="Learn+Grow lamb celebrating your progress" />
        </section>

        <section className="summary-stats" aria-label="Session overview">
          <article className="summary-card score-card">
            <div className="summary-card-heading">
              <span>Overall accuracy</span>
              <i className="status-dot" />
            </div>
            <ScoreRing accuracy={summary.accuracy} />
          </article>

          <article className="summary-card stat-card">
            <div className="summary-card-heading">
              <span>Average response</span>
            </div>
            <strong>{summary.averageResponseTimeSeconds}</strong>
            <p>seconds per question</p>
          </article>

          <article className="summary-card stat-card">
            <div className="summary-card-heading">
              <span>Finishing level</span>
            </div>
            <strong>{finalDifficulty}</strong>
            <p>{difficultyLabels[finalDifficulty - 1]}</p>
          </article>
        </section>

        <section className="summary-card chart-card">
          <div className="summary-section-heading">
            <div>
              <span className="summary-eyebrow">Adaptive path</span>
              <h2>Difficulty over time</h2>
            </div>
            <p>
              Learn+Grow adjusts upcoming questions from your recent answers.
            </p>
          </div>
          <DifficultyChart values={difficultyHistory} />
        </section>

        <section className="summary-content-grid">
          <article className="summary-card concepts-card">
            <div className="summary-section-heading">
              <div>
                <span className="summary-eyebrow">Focus areas</span>
                <h2>Concepts to revisit</h2>
              </div>
            </div>
            {summary.mostMissedConcepts.length > 0 ? (
              <div className="concept-pills">
                {summary.mostMissedConcepts.map((concept) => (
                  <span key={concept}>{concept}</span>
                ))}
              </div>
            ) : (
              <p className="summary-empty">No repeatedly missed concepts—lovely work.</p>
            )}
          </article>

          <article className="summary-card">
            <div className="summary-section-heading">
              <div>
                <span className="summary-eyebrow">What clicked</span>
                <h2>Strengths</h2>
              </div>
            </div>
            <InsightList
              items={summary.strengths}
              emptyText="Your strengths will appear after more answered questions."
              tone="positive"
            />
          </article>

          <article className="summary-card">
            <div className="summary-section-heading">
              <div>
                <span className="summary-eyebrow">Patterns noticed</span>
                <h2>Common mistakes</h2>
              </div>
            </div>
            <InsightList
              items={summary.commonMistakes}
              emptyText="No common error pattern was detected."
              tone="warning"
            />
          </article>

          <article className="summary-card">
            <div className="summary-section-heading">
              <div>
                <span className="summary-eyebrow">Keep growing</span>
                <h2>Suggested next steps</h2>
              </div>
            </div>
            <InsightList
              items={summary.suggestedNextSteps}
              emptyText="Complete another session to unlock recommendations."
              tone="next"
            />
          </article>
        </section>

        <div className="summary-actions">
          <button
            type="button"
            className="summary-secondary"
            onClick={() => navigate('/analytics')}
          >
            View learning trends
          </button>
          <button type="button" className="summary-primary" onClick={handleNewSession}>
            Start a new session <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </main>
  )
}
