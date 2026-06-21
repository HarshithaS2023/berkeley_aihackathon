import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompetitionStore } from '../../store/competitionStore'
import { useQuizStore } from '../../store/quizStore'
import { supabaseConfigured } from '../../lib/supabase'
import './Competition.css'

export default function CompetitionSetup() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [userName, setUserName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const createSession = useCompetitionStore((s) => s.createSession)
  const joinByCode = useCompetitionStore((s) => s.joinByCode)
  const compError = useCompetitionStore((s) => s.error)

  // Grab the source profile + settings from the quiz store (set by HomePage)
  const sourceProfile = useQuizStore((s) => s.sourceProfile)
  const settings = useQuizStore((s) => s.settings)

  if (!supabaseConfigured) {
    return (
      <main className="comp-setup">
        <div className="comp-card">
          <h2>Competition unavailable</h2>
          <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> to enable multiplayer.</p>
          <button className="comp-btn-secondary" onClick={() => navigate('/')}>Back</button>
        </div>
      </main>
    )
  }

  async function handleCreate() {
    if (!userName.trim()) { setError('Enter your name first.'); return }
    if (!sourceProfile) { setError('Go back and upload study material first.'); return }
    setError(null)
    setLoading(true)
    await createSession(sourceProfile, settings, userName.trim())
    setLoading(false)
    if (!compError) navigate('/compete/lobby')
  }

  async function handleJoin() {
    if (!userName.trim()) { setError('Enter your name first.'); return }
    if (!joinCode.trim()) { setError('Enter the 6-character code.'); return }
    setError(null)
    setLoading(true)
    await joinByCode(joinCode.trim(), userName.trim())
    setLoading(false)
    if (!compError) navigate('/compete/lobby')
  }

  if (mode === 'choose') {
    return (
      <main className="comp-setup">
        <div className="comp-card">
          <div className="comp-header">
            <span className="comp-badge">⚡ Challenge</span>
            <h1>Race a friend</h1>
            <p>Both of you start the same quiz at the same time. See whose adaptive path goes further.</p>
          </div>
          <div className="comp-mode-btns">
            <button className="comp-btn-primary" onClick={() => setMode('create')}>
              Create challenge
            </button>
            <button className="comp-btn-secondary" onClick={() => setMode('join')}>
              Join with a code
            </button>
          </div>
          <button className="comp-back-link" onClick={() => navigate('/')}>← Back to home</button>
        </div>
      </main>
    )
  }

  return (
    <main className="comp-setup">
      <div className="comp-card">
        <button className="comp-back-link" onClick={() => setMode('choose')}>← Back</button>
        <h2>{mode === 'create' ? 'Create a challenge' : 'Join a challenge'}</h2>

        <label className="comp-label">
          Your name
          <input
            className="comp-input"
            placeholder="e.g. Alex"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            maxLength={30}
          />
        </label>

        {mode === 'join' && (
          <label className="comp-label">
            Join code
            <input
              className="comp-input comp-code-input"
              placeholder="ABC123"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </label>
        )}

        {(error || compError) && (
          <p className="comp-error">{error ?? compError}</p>
        )}

        <button
          className="comp-btn-primary"
          onClick={mode === 'create' ? handleCreate : handleJoin}
          disabled={loading}
        >
          {loading ? 'Please wait…' : mode === 'create' ? 'Create & wait for opponent' : 'Join challenge'}
        </button>
      </div>
    </main>
  )
}
