import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import mascot from '../../assets/lamb-mascot.png'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <main className="auth-page">
        <img src={mascot} alt="" width={72} height={72} />
        <h2>Checking your session…</h2>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
