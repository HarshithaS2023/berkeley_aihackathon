import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetitionStore } from '../../store/competitionStore'
import './Competition.css'

export default function WaitingRoom() {
  const navigate = useNavigate()
  const phase = useCompetitionStore((s) => s.phase)
  const session = useCompetitionStore((s) => s.session)
  const me = useCompetitionStore((s) => s.me)
  const rival = useCompetitionStore((s) => s.rival)
  const reset = useCompetitionStore((s) => s.reset)
  const [countdown, setCountdown] = useState(3)
  const [copied, setCopied] = useState(false)

  // Redirect once quiz is ready
  useEffect(() => {
    if (phase === 'countdown') {
      const interval = setInterval(() => {
        setCountdown((n) => {
          if (n <= 1) { clearInterval(interval); return 0 }
          return n - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
    if (phase === 'quiz') navigate('/compete/quiz')
    if (phase === 'error') navigate('/compete')
  }, [phase, navigate])

  function copyLink() {
    const url = `${window.location.origin}/compete?code=${session?.code}`
    void navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (phase === 'countdown') {
    return (
      <main className="comp-waiting">
        <div className="comp-card comp-card-center">
          <p className="comp-vs-label">Get ready!</p>
          <div className="comp-countdown">{countdown}</div>
          <p className="comp-sub">Quiz starting…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="comp-waiting">
      <div className="comp-card">
        <div className="comp-header">
          <span className="comp-badge">⚡ Waiting room</span>
          <h2>Share your code</h2>
          <p>Your opponent needs this to join. The quiz starts the moment they connect.</p>
        </div>

        <div className="comp-code-display">{session?.code ?? '------'}</div>

        <button className="comp-btn-secondary" onClick={copyLink}>
          {copied ? '✓ Copied!' : 'Copy invite link'}
        </button>

        <div className="comp-players">
          <div className="comp-player comp-player-ready">
            <span className="comp-player-dot" />
            <span>{me?.userName ?? 'You'}</span>
            <span className="comp-player-tag">Ready</span>
          </div>
          <div className={`comp-player ${rival ? 'comp-player-ready' : 'comp-player-waiting'}`}>
            <span className="comp-player-dot" />
            <span>{rival ? rival.userName : 'Waiting for opponent…'}</span>
            {rival && <span className="comp-player-tag">Ready</span>}
          </div>
        </div>

        <button
          className="comp-back-link"
          onClick={() => { reset(); navigate('/') }}
        >
          Cancel
        </button>
      </div>
    </main>
  )
}
