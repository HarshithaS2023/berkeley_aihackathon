import { useNavigate } from 'react-router-dom'
import { useQuizStore } from '../store/quizStore'
import type { SummaryResponse } from '../types'

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

const cardStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '20px',
  boxShadow: 'var(--shadow)',
}

const metaLabel: React.CSSProperties = {
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text)',
  fontWeight: 600,
  marginBottom: '12px',
}

function ScoreRing({ accuracy }: { accuracy: number }) {
  const score = Math.round(accuracy * 100)
  const radius = 44
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - accuracy)
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color: 'var(--text-h)' }}>{score}%</span>
        <span className="text-xs" style={{ color: 'var(--text)' }}>accuracy</span>
      </div>
    </div>
  )
}

export default function SummaryPage() {
  const navigate = useNavigate()
  const summary = useQuizStore((s) => s.summary) ?? MOCK_SUMMARY
  const resetQuiz = useQuizStore((s) => s.resetQuiz)

  const handleNewSession = () => {
    resetQuiz()
    navigate('/')
  }

  return (
    <div className="min-h-full" style={{ background: 'var(--code-bg)', color: 'var(--text)' }}>
      <header
        className="px-6 py-4 flex items-center justify-between"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-h)' }}>
          Professor X
        </span>
        <span className="text-sm" style={{ color: 'var(--text)' }}>Session Summary</span>
      </header>

      <div className="max-w-[960px] mx-auto px-4 py-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Score + time */}
        <div className="grid grid-cols-2 gap-6">
          <div style={cardStyle}>
            <p style={metaLabel}>Score</p>
            <ScoreRing accuracy={summary.accuracy} />
          </div>
          <div style={cardStyle}>
            <p style={metaLabel}>Avg Response Time</p>
            <div className="flex items-end gap-1 mt-4">
              <span className="text-4xl font-bold" style={{ color: 'var(--text-h)' }}>
                {summary.averageResponseTimeSeconds}
              </span>
              <span className="mb-1 text-sm" style={{ color: 'var(--text)' }}>seconds</span>
            </div>
          </div>
        </div>

        {/* Missed concepts */}
        {summary.mostMissedConcepts.length > 0 && (
          <div style={cardStyle}>
            <p style={metaLabel}>Missed Concepts</p>
            <div className="flex flex-wrap gap-2">
              {summary.mostMissedConcepts.map((c, i) => (
                <span key={i} className="px-3 py-1 rounded-full text-sm" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Strengths */}
        <div style={cardStyle}>
          <p style={metaLabel}>Strengths</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-h)' }}>
                <span style={{ color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>✓</span>{s}
              </li>
            ))}
          </ul>
        </div>

        {/* Common mistakes */}
        <div style={cardStyle}>
          <p style={metaLabel}>Common Mistakes</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.commonMistakes.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-h)' }}>
                <span style={{ color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>!</span>{m}
              </li>
            ))}
          </ul>
        </div>

        {/* Next steps */}
        <div style={cardStyle}>
          <p style={metaLabel}>Next Steps</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.suggestedNextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-h)' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>{i + 1}.</span>{step}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center pb-8">
          <button
            onClick={() => navigate('/quiz')}
            style={{ background: 'var(--accent)', border: '1px solid var(--accent-border)', color: '#fff', borderRadius: '6px', padding: '10px 24px', fontSize: '0.95rem', cursor: 'pointer' }}
          >
            More Questions
          </button>
          <button
            onClick={handleNewSession}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-h)', borderRadius: '6px', padding: '10px 24px', fontSize: '0.95rem', cursor: 'pointer' }}
          >
            New Session
          </button>
        </div>
      </div>
    </div>
  )
}
