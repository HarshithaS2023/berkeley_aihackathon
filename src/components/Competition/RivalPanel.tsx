import type { CompetitionParticipant } from '../../lib/competition'
import './Competition.css'

type Props = {
  rival: CompetitionParticipant | null
  totalQuestions: number
}

const diffLabel = (d: number) => ['', 'Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'][d] ?? ''

export function RivalPanel({ rival, totalQuestions }: Props) {
  const accuracy =
    rival && rival.questionNumber > 0
      ? Math.round((rival.correctCount / rival.questionNumber) * 100)
      : null

  return (
    <aside className="rival-panel">
      <span className="rival-label">⚡ Rival</span>
      {rival ? (
        <>
          <p className="rival-name">{rival.userName}</p>
          <div className="rival-stats">
            <div className="rival-stat">
              <span className="rival-stat-value">{rival.questionNumber}/{totalQuestions}</span>
              <span className="rival-stat-label">Questions</span>
            </div>
            <div className="rival-stat">
              <span className="rival-stat-value">{accuracy !== null ? `${accuracy}%` : '—'}</span>
              <span className="rival-stat-label">Accuracy</span>
            </div>
            <div className="rival-stat">
              <span className="rival-stat-value">{diffLabel(rival.currentDifficulty)}</span>
              <span className="rival-stat-label">Difficulty</span>
            </div>
          </div>
          {rival.completed && (
            <p className="rival-done">Finished!</p>
          )}
          <div className="rival-progress-bar">
            <div
              className="rival-progress-fill"
              style={{ width: `${(rival.questionNumber / totalQuestions) * 100}%` }}
            />
          </div>
        </>
      ) : (
        <p className="rival-waiting">Waiting for opponent…</p>
      )}
    </aside>
  )
}
