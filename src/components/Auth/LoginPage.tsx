import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import mascot from '../../assets/lamb-mascot.png'
import { useAuth } from '../../contexts/AuthContext'
import './LoginPage.css'

type AuthMode = 'signin' | 'signup'

export default function LoginPage() {
  const { user, signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  if (user) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setVerifyEmail(null)
    setSubmitting(true)

    if (mode === 'signin') {
      const authError = await signIn(email.trim(), password)
      setSubmitting(false)

      if (authError) {
        setError(authError)
        return
      }

      navigate('/', { replace: true })
      return
    }

    const { error: authError, needsEmailVerification } = await signUp(
      email.trim(),
      password,
    )
    setSubmitting(false)

    if (authError) {
      setError(authError)
      return
    }

    const trimmedEmail = email.trim()

    if (needsEmailVerification) {
      setVerifyEmail(trimmedEmail)
      setMessage(
        `We sent a verification link to ${trimmedEmail}. Open your inbox and click the link before signing in.`,
      )
      setMode('signin')
      setPassword('')
      return
    }

    setMessage('Account created. You can sign in now.')
    setMode('signin')
    setPassword('')
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <header className="auth-nav">
        <Link className="auth-brand" to="/">
          <span className="auth-brand-mark">L+G</span>
          <span>
            <strong>Learn+Grow</strong>
            <small>Adaptive study partner</small>
          </span>
        </Link>
      </header>

      <section className="auth-shell">
        <div className="auth-hero">
          <img src={mascot} alt="" width={88} height={88} />
          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p>
            {mode === 'signin'
              ? 'Sign in to save quiz sessions and view your personal learning analytics.'
              : 'Create an account to track your progress. You will need to verify your email before signing in.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'signin' ? 'is-active' : undefined}
              onClick={() => {
                setMode('signin')
                setError(null)
                setMessage(null)
                setVerifyEmail(null)
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'is-active' : undefined}
              onClick={() => {
                setMode('signup')
                setError(null)
                setMessage(null)
                setVerifyEmail(null)
              }}
            >
              Sign up
            </button>
          </div>

          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@school.edu"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          {mode === 'signup' && (
            <p className="auth-verify-hint">
              After signing up, check your email for a verification link. You
              must verify before you can sign in.
            </p>
          )}

          {error && <p className="auth-error">{error}</p>}
          {verifyEmail && message && (
            <div className="auth-verify-notice" role="status">
              <strong>Verify your email</strong>
              <p>{message}</p>
              <small>Did not get it? Check spam or wait a minute, then try signing in.</small>
            </div>
          )}
          {!verifyEmail && message && <p className="auth-message">{message}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className="auth-footnote">
          Quiz practice works without an account. Sign in to track your progress
          over time.
        </p>
      </section>
    </main>
  )
}
