// Engagement Engine
// Analyzes interaction logs to produce scores that guide feed generation and prompt context.
// No ML — pure rule-based scoring from database queries.

import { db } from './db'

// ============================================
// Types
// ============================================
export interface EngagementProfile {
  // Activity patterns
  activeHours: number[]           // hours of day when user is most active (0-23)
  avgSessionsPerDay: number       // how often they open the app
  daysSinceLastVisit: number      // 0 = today
  totalInteractions7d: number     // raw count last 7 days

  // Feed preferences — which types do they actually engage with?
  feedTypeScores: Record<string, number> // type → 0-1 score (1 = high engagement)

  // Topic engagement — derived from feed items they tapped
  topicSignals: string[]          // topics they've shown interest in via behavior

  // Chat patterns
  chatFrequency: 'high' | 'medium' | 'low' | 'silent' // how often they chat
  avgMessageLength: 'brief' | 'moderate' | 'expansive'  // how much they write

  // Presence pattern
  presencePattern: 'daily' | 'regular' | 'sporadic' | 'absent'

  // Browser presence (from visibility_change events)
  avgFocusRatio: number | null  // 0-1 how focused their sessions are (null = no data)
  isCurrentlyPresent: boolean   // were they here in the last 5 minutes?
}

// ============================================
// COMPUTE — build a full engagement profile
// Called by feed generation + state update loops
// ============================================
export async function computeEngagement(userId: string): Promise<EngagementProfile> {
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

  // Pull all interactions from last 7 days
  const recentInteractions = await db.interaction.findMany({
    where: { userId, createdAt: { gt: sevenDaysAgo } },
    orderBy: { createdAt: 'desc' },
  })

  // Pull app_open events from last 30 days for presence pattern
  const appOpens = await db.interaction.findMany({
    where: { userId, type: 'app_open', createdAt: { gt: thirtyDaysAgo } },
    orderBy: { createdAt: 'desc' },
  })

  // Pull recent messages for chat pattern analysis
  const recentMessages = await db.message.findMany({
    where: { userId, role: 'user', createdAt: { gt: sevenDaysAgo } },
    select: { content: true, createdAt: true },
  })

  // ---- Active hours ----
  const hourCounts: Record<number, number> = {}
  recentInteractions.forEach((i) => {
    const hour = new Date(i.createdAt).getHours()
    hourCounts[hour] = (hourCounts[hour] || 0) + 1
  })
  const sortedHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => parseInt(h))
  const activeHours = sortedHours.length > 0 ? sortedHours : [9, 12, 20] // fallback

  // ---- Sessions per day ----
  const uniqueDays = new Set(
    appOpens.map((i) => new Date(i.createdAt).toDateString())
  )
  const daySpan = Math.max(1, Math.ceil((now - thirtyDaysAgo.getTime()) / (24 * 60 * 60 * 1000)))
  const avgSessionsPerDay = appOpens.length / daySpan

  // ---- Days since last visit ----
  const lastInteraction = recentInteractions[0]
  const daysSinceLastVisit = lastInteraction
    ? Math.floor((now - new Date(lastInteraction.createdAt).getTime()) / (24 * 60 * 60 * 1000))
    : 999

  // ---- Feed type scores ----
  const feedTaps = recentInteractions.filter((i) => i.type === 'feed_item_tap')
  const feedTypeCount: Record<string, number> = {}
  feedTaps.forEach((i) => {
    const meta = i.metadata as Record<string, unknown>
    const feedType = (meta?.type as string) || 'unknown'
    feedTypeCount[feedType] = (feedTypeCount[feedType] || 0) + 1
  })
  const maxTaps = Math.max(1, ...Object.values(feedTypeCount))
  const feedTypeScores: Record<string, number> = {}
  for (const [type, count] of Object.entries(feedTypeCount)) {
    feedTypeScores[type] = Math.round((count / maxTaps) * 100) / 100
  }

  // ---- Topic signals from feed taps ----
  // Extract topics from tapped feed items
  const tappedItemIds = feedTaps
    .map((i) => (i.metadata as Record<string, unknown>)?.feedItemId as string)
    .filter(Boolean)

  const topicSignals: string[] = []
  if (tappedItemIds.length > 0) {
    const tappedItems = await db.feedItem.findMany({
      where: { id: { in: tappedItemIds.slice(0, 20) } },
      select: { content: true, type: true },
    })
    // Extract simple keyword signals from tapped content
    const wordFreq: Record<string, number> = {}
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'that', 'this', 'it', 'its', 'and', 'or', 'but', 'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'your', 'you', 'i', 'me', 'my', 'we', 'our', 'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where', 'how', 'all', 'each', 'every', 'some', 'any', 'few', 'more', 'most', 'other', 'been', 'still', 'also'])
    tappedItems.forEach((item) => {
      const words = item.content.toLowerCase().split(/\s+/)
      words.forEach((w) => {
        const clean = w.replace(/[^a-z]/g, '')
        if (clean.length > 3 && !stopWords.has(clean)) {
          wordFreq[clean] = (wordFreq[clean] || 0) + 1
        }
      })
    })
    const sortedTopics = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word)
    topicSignals.push(...sortedTopics)
  }

  // ---- Chat frequency ----
  let chatFrequency: EngagementProfile['chatFrequency'] = 'silent'
  if (recentMessages.length >= 10) chatFrequency = 'high'
  else if (recentMessages.length >= 4) chatFrequency = 'medium'
  else if (recentMessages.length >= 1) chatFrequency = 'low'

  // ---- Message length ----
  let avgMessageLength: EngagementProfile['avgMessageLength'] = 'brief'
  if (recentMessages.length > 0) {
    const avgLen = recentMessages.reduce((s, m) => s + m.content.length, 0) / recentMessages.length
    if (avgLen > 150) avgMessageLength = 'expansive'
    else if (avgLen > 50) avgMessageLength = 'moderate'
  }

  // ---- Presence pattern ----
  let presencePattern: EngagementProfile['presencePattern'] = 'absent'
  const activeDays = uniqueDays.size
  if (activeDays >= 20) presencePattern = 'daily'
  else if (activeDays >= 10) presencePattern = 'regular'
  else if (activeDays >= 3) presencePattern = 'sporadic'

  // ---- Browser focus ratio (from session_end events that include focusRatio) ----
  const sessionEndEvents = recentInteractions.filter((i) => i.type === 'session_end')
  let avgFocusRatio: number | null = null
  if (sessionEndEvents.length > 0) {
    const ratios = sessionEndEvents
      .map((i) => (i.metadata as Record<string, unknown>)?.focusRatio as number)
      .filter((r) => typeof r === 'number')
    if (ratios.length > 0) {
      avgFocusRatio = Math.round((ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100) / 100
    }
  }

  // ---- Is currently present? (any interaction in last 5 minutes) ----
  const fiveMinAgo = new Date(now - 5 * 60 * 1000)
  const isCurrentlyPresent = recentInteractions.some((i) => new Date(i.createdAt) > fiveMinAgo)

  return {
    activeHours,
    avgSessionsPerDay: Math.round(avgSessionsPerDay * 100) / 100,
    daysSinceLastVisit,
    totalInteractions7d: recentInteractions.length,
    feedTypeScores,
    topicSignals,
    chatFrequency,
    avgMessageLength,
    presencePattern,
    avgFocusRatio,
    isCurrentlyPresent,
  }
}

// ============================================
// FORMAT — turn engagement into prompt-injectable text
// Used by feed-engine and prompt-engine
// ============================================
export function formatEngagementForPrompt(profile: EngagementProfile): string {
  const lines: string[] = []

  lines.push(`## User Engagement Profile`)
  lines.push(`- Presence: ${profile.presencePattern} (${profile.daysSinceLastVisit === 0 ? 'active today' : profile.daysSinceLastVisit + ' days since last visit'})`)
  lines.push(`- Chat style: ${profile.chatFrequency} frequency, ${profile.avgMessageLength} messages`)
  lines.push(`- Most active hours: ${profile.activeHours.map(h => `${h}:00`).join(', ')}`)

  if (Object.keys(profile.feedTypeScores).length > 0) {
    const topTypes = Object.entries(profile.feedTypeScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, score]) => `${type} (${Math.round(score * 100)}%)`)
    lines.push(`- Engages most with: ${topTypes.join(', ')}`)
  }

  if (profile.topicSignals.length > 0) {
    lines.push(`- Behavioral interest signals: ${profile.topicSignals.join(', ')}`)
  }

  // Browser presence awareness
  if (profile.avgFocusRatio !== null) {
    if (profile.avgFocusRatio > 0.8) {
      lines.push(`- When they're here, they're focused — they don't tab away much.`)
    } else if (profile.avgFocusRatio < 0.4) {
      lines.push(`- They tend to have the app open in a background tab — half-present.`)
    }
  }

  if (profile.isCurrentlyPresent) {
    lines.push(`- They're here RIGHT NOW (active in the last few minutes).`)
  }

  return lines.join('\n')
}
