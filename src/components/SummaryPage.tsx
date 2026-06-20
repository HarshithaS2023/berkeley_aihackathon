import { useNavigate } from 'react-router-dom'
import { useStore, type SummaryResponse } from '../store/useStore'

const MOCK_SUMMARY: SummaryResponse = {
  score: 72,
  commonMistakes: [
    'Sign errors when distributing negative terms',
    'Forgetting to apply the chain rule on composite functions',
    'Mixing up product rule and quotient rule steps',
  ],
  strengths: [
    'Solid grasp of the basic power rule',
    'Clean algebraic manipulation',
    'Correctly identifies when to differentiate vs. integrate',
  ],
  nextSteps: [
    'Do 5 chain-rule problems focusing on trig compositions',
    'Review sign distribution with parentheses (negative leading coefficients)',
    'Practice quotient rule with rational functions',
  ],
  timePerQuestion: [45, 120, 90, 67, 200, 55, 180, 88, 110, 95],
}

function ScoreRing({ score }: { score: number }) {
  const radius = 44
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - score / 100)
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color: 'var(--text-h)' }}>{score}</span>
        <span className="text-xs" style={{ color: 'var(--text)' }}>/ 100</span>
      </div>
    </div>
  )
}

function TimeBar({ times }: { times: number[] }) {
  const max = Math.max(...times)
  return (
    <div className="flex items-end gap-1 h-16">
      {times.map((t, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
          <div
            className="w-full rounded-t"
            style={{ height: `${(t / max) * 56}px`, background: 'var(--accent)' }}
            title={`Q${i + 1}: ${t}s`}
          />
          <span className="text-[10px]" style={{ color: 'var(--text)' }}>{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '20px',
  boxShadow: 'var(--shadow)',
}

const metaLabelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text)',
  fontWeight: 600,
  marginBottom: '12px',
}

export default function SummaryPage() {
  const navigate = useNavigate()
  const { summaryResponse, questionHistory, resetSession } = useStore()

  const summary = summaryResponse ?? MOCK_SUMMARY
  const times = questionHistory.length > 0
    ? questionHistory.map((r) => r.timeSpent)
    : summary.timePerQuestion
  const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0

  const handleNewSession = () => {
    resetSession()
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
            <p style={metaLabelStyle}>Score</p>
            <ScoreRing score={summary.score} />
          </div>
          <div style={cardStyle}>
            <p style={metaLabelStyle}>Time per Question (s)</p>
            <TimeBar times={times} />
            <p className="text-xs text-center mt-2" style={{ color: 'var(--text)' }}>avg {avgTime}s</p>
          </div>
        </div>

        {/* Strengths */}
        <div style={cardStyle}>
          <p style={metaLabelStyle}>Strengths</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-h)' }}>
                <span style={{ color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Common mistakes */}
        <div style={cardStyle}>
          <p style={metaLabelStyle}>Common Mistakes</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.commonMistakes.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-h)' }}>
                <span style={{ color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>!</span>
                {m}
              </li>
            ))}
          </ul>
        </div>

        {/* Next steps */}
        <div style={cardStyle}>
          <p style={metaLabelStyle}>Next Steps</p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-h)' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>{i + 1}.</span>
                {step}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center pb-8">
          <button
            onClick={() => navigate('/quiz')}
            style={{
              background: 'var(--accent)',
              border: '1px solid var(--accent-border)',
              color: '#fff',
              borderRadius: '6px',
              padding: '10px 24px',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            More Questions
          </button>
          <button
            onClick={handleNewSession}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-h)',
              borderRadius: '6px',
              padding: '10px 24px',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            New Session
          </button>
        </div>
      </div>
    </div>
  )
}
