import { useNavigate } from 'react-router-dom'
import { useCompetitionStore } from '../../store/competitionStore'
import type { SessionResult } from '../../types'
import './Competition.css'

const difficultyLabel = (d: number) =>
  ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'][d] ?? `Level ${d}`

function challengeScore(results: SessionResult[] | null | undefined): number {
  if (!results) return 0
  return results.reduce((sum, r) => sum + (r.feedback.correct ? r.question.difficulty : 0), 0)
}

function totalSeconds(results: SessionResult[] | null | undefined): number {
  if (!results) return Infinity
  return results.reduce((sum, r) => sum + r.submission.responseTimeSeconds, 0)
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function CompetitionResults() {
  const navigate = useNavigate()
  const me = useCompetitionStore((s) => s.me)
  const rival = useCompetitionStore((s) => s.rival)
  const reset = useCompetitionStore((s) => s.reset)

  const myScore = challengeScore(me?.results)
  const rivalScore = challengeScore(rival?.results)
  const myTime = totalSeconds(me?.results)
  const rivalTime = totalSeconds(rival?.results)

  const myAccuracy = me && me.questionNumber > 0
    ? Math.round((me.correctCount / me.questionNumber) * 100)
    : 0
  const rivalAccuracy = rival && rival.questionNumber > 0
    ? Math.round((rival.correctCount / rival.questionNumber) * 100)
    : 0

  const bothDone = Boolean(me?.completed && rival?.completed)

  // Primary: challenge score. Tiebreaker: faster time
  const iWon = myScore > rivalScore || (myScore === rivalScore && myTime < rivalTime)
  const tied = myScore === rivalScore && Math.round(myTime) === Math.round(rivalTime)

  const tiebreakByTime = bothDone && myScore === rivalScore && !tied

  function handleDone() {
    reset()
    navigate('/')
  }

  return (
    <main className="comp-results">
      <div className="comp-card comp-results-card">

        <div className="comp-results-banner">
          {!bothDone ? (
            <><span className="comp-result-emoji">⏳</span><h1>Results</h1></>
          ) : tied ? (
            <><span className="comp-result-emoji">🤝</span><h1>It's a tie!</h1></>
          ) : iWon ? (
            <><span className="comp-result-emoji">🏆</span><h1>You won!</h1></>
          ) : (
            <><span className="comp-result-emoji">📚</span><h1>Good effort!</h1></>
          )}
          {bothDone && !tied && (
            <p className="comp-results-subtitle">
              {tiebreakByTime
                ? iWon
                  ? 'Same score — you finished faster.'
                  : `Same score — ${rival?.userName ?? 'opponent'} finished faster.`
                : iWon
                  ? 'Higher challenge score.'
                  : `${rival?.userName ?? 'Opponent'} earned a higher challenge score.`}
            </p>
          )}
        </div>

        <div className="comp-results-grid">
          <div className={`comp-result-col ${bothDone && (iWon || tied) ? 'comp-result-winner' : ''}`}>
            <p className="comp-result-name">You ({me?.userName})</p>
            <p className="comp-result-accuracy">{myScore}</p>
            <p className="comp-result-label">Challenge Score</p>
            <p className="comp-result-detail">{myAccuracy}% accuracy · {me?.correctCount ?? 0}/{me?.questionNumber ?? 0} correct</p>
            <p className="comp-result-diff">Peak: {difficultyLabel(me?.currentDifficulty ?? 0)}</p>
            <p className="comp-result-diff">Time: {formatTime(myTime)}</p>
          </div>

          <div className="comp-result-divider">VS</div>

          <div className={`comp-result-col ${bothDone && (!iWon || tied) ? 'comp-result-winner' : ''}`}>
            <p className="comp-result-name">{rival?.userName ?? 'Opponent'}</p>
            <p className="comp-result-accuracy">{bothDone ? rivalScore : '…'}</p>
            <p className="comp-result-label">Challenge Score</p>
            <p className="comp-result-detail">{rivalAccuracy}% accuracy · {rival?.correctCount ?? 0}/{rival?.questionNumber ?? 0} correct</p>
            <p className="comp-result-diff">Peak: {difficultyLabel(rival?.currentDifficulty ?? 0)}</p>
            <p className="comp-result-diff">Time: {rival?.completed ? formatTime(rivalTime) : 'still going…'}</p>
          </div>
        </div>

        <div className="comp-score-explainer">
          <p>
            Challenge Score counts difficulty-weighted points — each correct answer earns
            its difficulty level (1–5 pts). Harder questions are worth more.
            Ties are broken by fastest completion time.
          </p>
        </div>

        {!bothDone && (
          <p className="comp-waiting-note">⏳ Still waiting for {rival?.userName ?? 'your opponent'} to finish…</p>
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
