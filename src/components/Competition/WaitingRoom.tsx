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
  const setReady = useCompetitionStore((s) => s.setReady)
  const refreshLobby = useCompetitionStore((s) => s.refreshLobby)
  const [countdown, setCountdown] = useState(3)
  const [copied, setCopied] = useState(false)
  const [readyLoading, setReadyLoading] = useState(false)

  useEffect(() => {
    if (!session) {
      navigate('/compete')
      return
    }
    void refreshLobby()
  }, [session, navigate, refreshLobby])

  useEffect(() => {
    if (phase === 'countdown') {
      setCountdown(3)
      const interval = setInterval(() => {
        setCountdown((n) => {
          if (n <= 1) {
            clearInterval(interval)
            return 0
          }
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

  async function toggleReady() {
    if (!me) return
    setReadyLoading(true)
    await setReady(!me.ready)
    setReadyLoading(false)
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

  const bothReady = Boolean(me?.ready && rival?.ready)

  return (
    <main className="comp-waiting">
      <div className="comp-card">
        <div className="comp-header">
          <span className="comp-badge">⚡ Waiting room</span>
          <h2>Share your code</h2>
          <p>Send the invite link or code to your opponent. The quiz starts when both players are ready.</p>
        </div>

        <div className="comp-code-display">{session?.code ?? '------'}</div>

        <button className="comp-btn-secondary" onClick={copyLink}>
          {copied ? '✓ Copied!' : 'Copy invite link'}
        </button>

        <div className="comp-players">
          <div className={`comp-player ${me?.ready ? 'comp-player-ready' : 'comp-player-waiting'}`}>
            <span className="comp-player-dot" />
            <span>{me?.userName ?? 'You'}</span>
            <span className="comp-player-tag">{me?.ready ? 'Ready' : 'Not ready'}</span>
          </div>
          <div className={`comp-player ${rival?.ready ? 'comp-player-ready' : 'comp-player-waiting'}`}>
            <span className="comp-player-dot" />
            <span>{rival ? rival.userName : 'Waiting for opponent…'}</span>
            {rival && (
              <span className="comp-player-tag">{rival.ready ? 'Ready' : 'Not ready'}</span>
            )}
          </div>
        </div>

        <button
          className={me?.ready ? 'comp-btn-secondary' : 'comp-btn-primary'}
          onClick={() => void toggleReady()}
          disabled={readyLoading || !rival}
        >
          {readyLoading
            ? 'Updating…'
            : !rival
              ? 'Waiting for opponent to join…'
              : me?.ready
                ? 'Mark not ready'
                : 'Mark ready'}
        </button>

        {rival && !bothReady && (
          <p className="comp-lobby-hint">Both players must mark ready before the countdown begins.</p>
        )}

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
