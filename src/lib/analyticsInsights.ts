import type {
  AnalyticsSnapshot,
  ConceptStat,
  DbMistake,
  DbQuestion,
  DbSession,
  SessionTrendPoint,
  TopicTrendPoint,
  TrendInsight,
} from '../types/analytics'

const TOPIC_COLORS = [
  '#536840',
  '#8b6914',
  '#3d6b8c',
  '#9c4d7a',
  '#6b5b95',
  '#c45c26',
]

export const CHART_TOPIC_COLORS = TOPIC_COLORS

function formatSessionLabel(dateIso: string, index: number): string {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return `Session ${index + 1}`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFullDate(dateIso: string): string {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return dateIso
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function buildSessionTrend(sessions: DbSession[]): SessionTrendPoint[] {
  return sessions.map((session, index) => ({
    sessionId: session.id,
    label: formatSessionLabel(session.created_at, index),
    date: session.created_at,
    accuracyPct: Math.round((session.accuracy ?? 0) * 1000) / 10,
    avgTimeSec: session.avg_time ?? 0,
    topics: session.topics?.length ? session.topics : ['General'],
  }))
}

function buildTopicTrends(sessions: DbSession[]): TopicTrendPoint[] {
  const points: TopicTrendPoint[] = []

  sessions.forEach((session, sessionIndex) => {
    const topics = session.topics?.length ? session.topics : ['General']
    const accuracyPct = Math.round((session.accuracy ?? 0) * 1000) / 10
    const label = formatSessionLabel(session.created_at, sessionIndex)

    for (const topic of topics) {
      points.push({
        topic,
        label,
        date: session.created_at,
        accuracyPct,
        sessionIndex,
      })
    }
  })

  return points
}

function buildConceptStats(
  questions: DbQuestion[],
  mistakes: DbMistake[],
): { topMissed: ConceptStat[]; byAccuracy: ConceptStat[] } {
  const questionMap = new Map<
    string,
    { total: number; correct: number; misses: number }
  >()

  for (const question of questions) {
    const concepts =
      question.concepts?.length > 0 ? question.concepts : ['General']
    for (const concept of concepts) {
      const entry = questionMap.get(concept) ?? { total: 0, correct: 0, misses: 0 }
      entry.total += 1
      if (question.correct) entry.correct += 1
      questionMap.set(concept, entry)
    }
  }

  for (const mistake of mistakes) {
    const concept = mistake.concept || 'General'
    const entry = questionMap.get(concept) ?? { total: 0, correct: 0, misses: 0 }
    entry.misses += 1
    questionMap.set(concept, entry)
  }

  const stats: ConceptStat[] = [...questionMap.entries()].map(
    ([concept, data]) => ({
      concept,
      missCount: data.misses,
      questionCount: data.total,
      accuracyPct:
        data.total > 0 ? Math.round((data.correct / data.total) * 1000) / 10 : 0,
    }),
  )

  const topMissed = [...stats]
    .filter((s) => s.missCount > 0)
    .sort((a, b) => b.missCount - a.missCount)
    .slice(0, 8)

  const byAccuracy = [...stats]
    .filter((s) => s.questionCount >= 2)
    .sort((a, b) => a.accuracyPct - b.accuracyPct)
    .slice(0, 8)

  return { topMissed, byAccuracy }
}

function detectTopicDips(topicTrends: TopicTrendPoint[]): TrendInsight[] {
  const byTopic = new Map<string, TopicTrendPoint[]>()

  for (const point of topicTrends) {
    const list = byTopic.get(point.topic) ?? []
    list.push(point)
    byTopic.set(point.topic, list)
  }

  const insights: TrendInsight[] = []

  for (const [topic, points] of byTopic) {
    if (points.length < 2) continue

    const sorted = [...points].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const drop = curr.accuracyPct - prev.accuracyPct

      if (drop <= -15) {
        insights.push({
          type: 'dip',
          topic,
          title: `Dip in ${topic}`,
          body: `Accuracy on ${topic} fell from ${prev.accuracyPct}% (${formatFullDate(prev.date)}) to ${curr.accuracyPct}% (${formatFullDate(curr.date)}). That is a ${Math.abs(Math.round(drop))} point drop — worth revisiting this subject before your next session.`,
        })
      }
    }

    if (sorted.length >= 3) {
      const firstAvg =
        sorted.slice(0, Math.min(2, sorted.length - 1)).reduce((s, p) => s + p.accuracyPct, 0) /
        Math.min(2, sorted.length - 1)
      const lastAvg =
        sorted.slice(-2).reduce((s, p) => s + p.accuracyPct, 0) / 2
      const gain = lastAvg - firstAvg

      if (gain >= 12) {
        insights.push({
          type: 'improvement',
          topic,
          title: `${topic} is trending up`,
          body: `Your recent ${topic} sessions average ${Math.round(lastAvg)}% accuracy, up about ${Math.round(gain)} points from earlier practice. Keep building on that momentum.`,
        })
      }
    }
  }

  return insights
}

function buildPaceInsight(sessionTrend: SessionTrendPoint[]): TrendInsight | null {
  if (sessionTrend.length < 2) return null

  const first = sessionTrend[0].avgTimeSec
  const last = sessionTrend[sessionTrend.length - 1].avgTimeSec
  const diff = first - last

  if (Math.abs(diff) < 8) return null

  if (diff > 0) {
    return {
      type: 'pace',
      title: 'You are answering faster',
      body: `Average time per question dropped from ${first}s early on to ${last}s in your latest session — a sign you are internalizing the material.`,
    }
  }

  return {
    type: 'pace',
    title: 'Sessions are taking longer',
    body: `Average time rose from ${first}s to ${last}s. Harder questions or new topics may be slowing you down — that is normal when difficulty increases.`,
  }
}

function buildWeaknessInsight(topMissed: ConceptStat[]): TrendInsight | null {
  if (topMissed.length === 0) return null

  const top = topMissed[0]
  return {
    type: 'weakness',
    title: `Focus area: ${top.concept}`,
    body: `${top.concept} appears most often in your mistake history (${top.missCount} recorded miss${top.missCount === 1 ? '' : 'es'}). Prioritize a short review here before your next quiz.`,
  }
}

function buildSummaryInsight(
  sessionCount: number,
  overallAccuracyPct: number,
  sessionTrend: SessionTrendPoint[],
): TrendInsight | null {
  if (sessionCount === 0) return null

  if (sessionCount === 1) {
    return {
      type: 'summary',
      title: 'First session logged',
      body: `You scored ${sessionTrend[0]?.accuracyPct ?? overallAccuracyPct}% on your first tracked quiz. Complete a few more sessions to unlock trend lines and dip detection across subjects.`,
    }
  }

  const earliest = sessionTrend[0]
  const latest = sessionTrend[sessionTrend.length - 1]
  if (!earliest || !latest) return null

  const accuracyDelta = latest.accuracyPct - earliest.accuracyPct

  let trendPhrase = 'holding steady'
  if (accuracyDelta >= 10) trendPhrase = 'improving overall'
  else if (accuracyDelta <= -10) trendPhrase = 'slipping overall'

  return {
    type: 'summary',
    title: `${sessionCount} sessions tracked`,
    body: `Across all quizzes you average ${overallAccuracyPct}% accuracy and you are ${trendPhrase} (${earliest.accuracyPct}% → ${latest.accuracyPct}% from first to latest session).`,
  }
}

export function buildAnalyticsSnapshot(
  sessions: DbSession[],
  mistakes: DbMistake[],
  questions: DbQuestion[],
): AnalyticsSnapshot {
  if (sessions.length === 0) {
    return {
      sessionCount: 0,
      overallAccuracyPct: 0,
      sessionTrend: [],
      topicTrends: [],
      topMissedConcepts: [],
      conceptAccuracy: [],
      insights: [],
      topics: [],
    }
  }

  const sessionTrend = buildSessionTrend(sessions)
  const topicTrends = buildTopicTrends(sessions)
  const { topMissed, byAccuracy } = buildConceptStats(questions, mistakes)

  const overallAccuracyPct =
    sessions.length > 0
      ? Math.round(
          (sessions.reduce((sum, s) => sum + (s.accuracy ?? 0), 0) / sessions.length) *
            1000,
        ) / 10
      : 0

  const topics = [...new Set(topicTrends.map((p) => p.topic))].sort()

  const insights: TrendInsight[] = [
    buildSummaryInsight(sessions.length, overallAccuracyPct, sessionTrend),
    ...detectTopicDips(topicTrends),
    buildWeaknessInsight(topMissed),
    buildPaceInsight(sessionTrend),
  ].filter((item): item is TrendInsight => item !== null)

  return {
    sessionCount: sessions.length,
    overallAccuracyPct,
    sessionTrend,
    topicTrends,
    topMissedConcepts: topMissed,
    conceptAccuracy: byAccuracy,
    insights,
    topics,
  }
}
