import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import mascot from '../../assets/lamb-mascot.png'
import { useAuth } from '../../contexts/AuthContext'
import { CHART_TOPIC_COLORS } from '../../lib/analyticsInsights'
import { fetchAnalyticsSnapshot } from '../../services/analyticsApi'
import type { AnalyticsSnapshot, TopicTrendPoint } from '../../types/analytics'
import './AnalyticsPage.css'

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { color: string; name: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="analytics-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <div key={entry.name}>
          {entry.name}: {entry.value}
          {entry.name.toLowerCase().includes('time') ? 's' : '%'}
        </div>
      ))}
    </div>
  )
}

function pivotTopicTrends(topicTrends: TopicTrendPoint[]) {
  const labels = [...new Set(topicTrends.map((point) => point.label))]
  const topics = [...new Set(topicTrends.map((point) => point.topic))]

  const rows = labels.map((label) => {
    const row: Record<string, string | number> = { label }
    for (const topic of topics) {
      const match = topicTrends.find(
        (point) => point.label === label && point.topic === topic,
      )
      if (match) row[topic] = match.accuracyPct
    }
    return row
  })

  return { rows, topics }
}

function AnalyticsContent({ data }: { data: AnalyticsSnapshot }) {
  const topicChart = useMemo(
    () => pivotTopicTrends(data.topicTrends),
    [data.topicTrends],
  )

  const paceChart = data.sessionTrend.map((point) => ({
    label: point.label,
    avgTimeSec: point.avgTimeSec,
  }))

  const missedConceptChart = data.topMissedConcepts.map((item) => ({
    concept:
      item.concept.length > 22 ? `${item.concept.slice(0, 20)}…` : item.concept,
    missCount: item.missCount,
  }))

  return (
    <>
      <section className="analytics-stats">
        <div className="analytics-stat">
          <span>Sessions</span>
          <strong>{data.sessionCount}</strong>
        </div>
        <div className="analytics-stat">
          <span>Average accuracy</span>
          <strong>{data.overallAccuracyPct}%</strong>
        </div>
        <div className="analytics-stat">
          <span>Subjects tracked</span>
          <strong>{data.topics.length}</strong>
        </div>
      </section>

      <section className="analytics-grid">
        <article className="analytics-card">
          <h2>Accuracy over time</h2>
          <p>Each point is one completed quiz session.</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.sessionTrend}>
              <CartesianGrid stroke="rgba(92,108,73,0.12)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: '#6c7462', fontSize: 12 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#6c7462', fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="accuracyPct"
                name="Accuracy"
                stroke="#536840"
                strokeWidth={3}
                dot={{ r: 4, fill: '#536840' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="analytics-card">
          <h2>Trend insights</h2>
          <p>Dips, improvements, and focus areas from your session history.</p>
          <div className="analytics-insights">
            {data.insights.map((insight) => (
              <div
                key={`${insight.type}-${insight.title}`}
                className={`analytics-insight ${insight.type}`}
              >
                <h3>{insight.title}</h3>
                <p>{insight.body}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {topicChart.topics.length > 0 && (
        <article className="analytics-card">
          <h2>Accuracy by subject</h2>
          <p>
            Separate lines for each topic across sessions — look for dips where a
            subject drops between quizzes.
          </p>
          <div className="analytics-legend">
            {topicChart.topics.map((topic, index) => (
              <span className="analytics-legend-item" key={topic}>
                <i style={{ background: CHART_TOPIC_COLORS[index % CHART_TOPIC_COLORS.length] }} />
                {topic}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={topicChart.rows}>
              <CartesianGrid stroke="rgba(92,108,73,0.12)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: '#6c7462', fontSize: 12 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#6c7462', fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {topicChart.topics.map((topic, index) => (
                <Line
                  key={topic}
                  type="monotone"
                  dataKey={topic}
                  name={topic}
                  stroke={CHART_TOPIC_COLORS[index % CHART_TOPIC_COLORS.length]}
                  strokeWidth={2.5}
                  connectNulls
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </article>
      )}

      <section className="analytics-grid">
        <article className="analytics-card">
          <h2>Most missed concepts</h2>
          <p>Concepts that show up most often in your mistake history.</p>
          {missedConceptChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={missedConceptChart} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="rgba(92,108,73,0.12)" strokeDasharray="4 4" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#6c7462', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="concept"
                  width={120}
                  tick={{ fill: '#6c7462', fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="missCount" name="Misses" fill="#c45c26" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p>No recorded mistakes yet — strong work.</p>
          )}
        </article>

        <article className="analytics-card">
          <h2>Response pace</h2>
          <p>Average seconds per question across sessions.</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={paceChart}>
              <CartesianGrid stroke="rgba(92,108,73,0.12)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill: '#6c7462', fontSize: 12 }} />
              <YAxis tick={{ fill: '#6c7462', fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="avgTimeSec"
                name="Avg time"
                stroke="#3d6b8c"
                strokeWidth={3}
                dot={{ r: 4, fill: '#3d6b8c' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>
    </>
  )
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [data, setData] = useState<AnalyticsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    void fetchAnalyticsSnapshot()
      .then((snapshot) => {
        if (!cancelled) setData(snapshot)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (loading) {
    return (
      <main className="analytics-loading">
        <img src={mascot} alt="" width={72} height={72} />
        <h2>Loading your learning trends…</h2>
      </main>
    )
  }

  if (error) {
    const needsMigration =
      error.includes('user_id') ||
      error.includes('auth_migration.sql')

    return (
      <main className="analytics-error">
        <img src={mascot} alt="" width={72} height={72} />
        <h2>{needsMigration ? 'One-time database setup needed' : 'Could not load analytics'}</h2>
        <p>{error}</p>
        {needsMigration && (
          <ol className="analytics-setup-steps">
            <li>Open your Supabase project → SQL Editor</li>
            <li>Paste and run the contents of <code>supabase/auth_migration.sql</code></li>
            <li>Refresh this page</li>
          </ol>
        )}
        <button className="quiz-primary" type="button" onClick={() => navigate('/')}>
          Back home
        </button>
      </main>
    )
  }

  if (!data || data.sessionCount === 0) {
    return (
      <main className="analytics-empty">
        <img src={mascot} alt="" width={72} height={72} />
        <h2>No sessions yet</h2>
        <p>
          Complete a quiz while signed in — your session will be saved to your
          account and show up here with trends and insights.
        </p>
        <button className="quiz-primary" type="button" onClick={() => navigate('/')}>
          Start a quiz
        </button>
        {!user && (
          <button className="quiz-secondary" type="button" onClick={() => navigate('/login')}>
            Sign in
          </button>
        )}
      </main>
    )
  }

  return (
    <main className="analytics-page">
      <header className="analytics-nav">
        <button
          type="button"
          className="analytics-brand"
          onClick={() => navigate('/')}
        >
          <img src={mascot} alt="" />
          <span>
            <strong>Learn+Grow</strong>
            <small>Learning analytics</small>
          </span>
        </button>
        <div className="analytics-nav-actions">
          {user?.email && (
            <span className="analytics-user-email" title={user.email}>
              {user.email}
            </span>
          )}
          <button className="quiz-secondary" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
          <button className="quiz-secondary" type="button" onClick={() => navigate('/')}>
            Home
          </button>
          <button className="quiz-primary" type="button" onClick={() => navigate('/')}>
            New quiz
          </button>
        </div>
      </header>

      <div className="analytics-shell">
        <section className="analytics-hero">
          <h1>Your learning trends</h1>
          <p>
            Patterns across {data.sessionCount} saved session
            {data.sessionCount === 1 ? '' : 's'} — accuracy dips by subject, missed
            concepts, and how your pace is changing over time.
          </p>
        </section>

        <AnalyticsContent data={data} />
      </div>
    </main>
  )
}
