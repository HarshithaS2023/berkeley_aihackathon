import { useNavigate } from 'react-router-dom'
import { useCompetitionStore } from '../../store/competitionStore'
import './Competition.css'

export default function CompetitionResults() {
  const navigate = useNavigate()
  const me = useCompetitionStore((s) => s.me)
  const rival = useCompetitionStore((s) => s.rival)
  const reset = useCompetitionStore((s) => s.reset)

  const myAccuracy = me && me.questionNumber > 0
    ? Math.round((me.correctCount / me.questionNumber) * 100)
    : 0
  const rivalAccuracy = rival && rival.questionNumber > 0
    ? Math.round((rival.correctCount / rival.questionNumber) * 100)
    : 0

  const iWon = myAccuracy > rivalAccuracy
  const tied = myAccuracy === rivalAccuracy

  function handleDone() {
    reset()
    navigate('/')
  }

  return (
    <main className="comp-results">
      <div className="comp-card comp-results-card">
        <div className="comp-results-banner">
          {tied
            ? <><span className="comp-result-emoji">🤝</span><h1>It's a tie!</h1></>
            : iWon
            ? <><span className="comp-result-emoji">🏆</span><h1>You won!</h1></>
            : <><span className="comp-result-emoji">📚</span><h1>Good effort!</h1></>}
        </div>

        <div className="comp-results-grid">
          <div className={`comp-result-col ${iWon || tied ? 'comp-result-winner' : ''}`}>
            <p className="comp-result-name">You ({me?.userName})</p>
            <p className="comp-result-accuracy">{myAccuracy}%</p>
            <p className="comp-result-label">Accuracy</p>
            <p className="comp-result-detail">{me?.correctCount ?? 0} / {me?.questionNumber ?? 0} correct</p>
            <p className="comp-result-diff">Peak difficulty: {me?.currentDifficulty ?? '—'}</p>
          </div>

          <div className="comp-result-divider">VS</div>

          <div className={`comp-result-col ${!iWon || tied ? '' : ''} ${!iWon && !tied ? 'comp-result-winner' : ''}`}>
            <p className="comp-result-name">{rival?.userName ?? 'Opponent'}</p>
            <p className="comp-result-accuracy">{rivalAccuracy}%</p>
            <p className="comp-result-label">Accuracy</p>
            <p className="comp-result-detail">{rival?.correctCount ?? 0} / {rival?.questionNumber ?? 0} correct</p>
            <p className="comp-result-diff">Peak difficulty: {rival?.currentDifficulty ?? '—'}</p>
          </div>
        </div>

        {rival && !rival.completed && (
          <p className="comp-waiting-note">⏳ Still waiting for your opponent to finish…</p>
        )}

        <div className="comp-results-actions">
          <button className="comp-btn-primary" onClick={handleDone}>
            Back to home
          </button>
        </div>
      </div>
    </main>
  )
}
