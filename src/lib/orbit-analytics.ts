// ============================================
// ORBIT ANALYTICS ENGINE
// Performance metrics, engagement scoring,
// and AI-powered insights for Orbit network
// ============================================

import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'

// ============================================
// TYPES
// ============================================

export interface EngagementMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  clicks: number
  saves: number
  reach: number
  impressions: number
}

export interface EngagementScore {
  total: number
  rate: number
  virality: number
  sentiment: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface CharacterPerformance {
  characterId: string
  characterName: string
  roleType: string
  totalPosts: number
  publishedPosts: number
  avgEngagementScore: number
  totalViews: number
  totalLikes: number
  totalComments: number
  totalShares: number
  engagementRate: number
  topPost: { id: string; content: string; score: number } | null
  contentBreakdown: Record<string, number>
  platformBreakdown: Record<string, number>
  trend: 'up' | 'down' | 'stable'
  trendPercent: number
}

export interface CampaignAnalytics {
  campaignId: string
  campaignName: string
  totalPosts: number
  publishedPosts: number
  totalEngagement: number
  avgEngagementRate: number
  topPerformer: string
  characterBreakdown: { name: string; posts: number; engagement: number }[]
}

export interface PlatformAnalytics {
  platform: string
  totalPosts: number
  avgEngagement: number
  bestContentType: string
  peakDay: string
  trend: 'up' | 'down' | 'stable'
}

export interface ContentTypeAnalytics {
  contentType: string
  totalPosts: number
  avgEngagement: number
  avgViews: number
  topPlatform: string
  trend: 'up' | 'down' | 'stable'
}

export interface AnalyticsSummary {
  overview: {
    totalPosts: number
    publishedPosts: number
    totalEngagement: number
    avgEngagementRate: number
    totalReach: number
    activeCharacters: number
    activeCampaigns: number
    bestDay: string
  }
  characterPerformance: CharacterPerformance[]
  platformAnalytics: PlatformAnalytics[]
  contentTypeAnalytics: ContentTypeAnalytics[]
  campaignAnalytics: CampaignAnalytics[]
  recentTrends: {
    period: string
    engagementChange: number
    reachChange: number
    postFrequencyChange: number
  }
  aiInsights: string[]
}

// ============================================
// ENGAGEMENT SCORING
// ============================================

export function calculateEngagementScore(metrics: EngagementMetrics): EngagementScore {
  const weights = {
    likes: 1,
    comments: 3,
    shares: 5,
    saves: 4,
    clicks: 2,
  }

  const weighted =
    (metrics.likes * weights.likes) +
    (metrics.comments * weights.comments) +
    (metrics.shares * weights.shares) +
    (metrics.saves * weights.saves) +
    (metrics.clicks * weights.clicks)

  const total = Math.round(weighted)

  const impressions = metrics.impressions || metrics.views || 1
  const rate = parseFloat(((metrics.likes + metrics.comments + metrics.shares) / impressions * 100).toFixed(2))

  const virality = metrics.impressions > 0
    ? parseFloat((metrics.shares / impressions * 100).toFixed(2))
    : 0

  const sentiment = metrics.comments > 0
    ? Math.min(100, Math.round((metrics.likes / (metrics.comments + metrics.likes)) * 100))
    : 50

  let grade: EngagementScore['grade'] = 'F'
  if (rate >= 10) grade = 'S'
  else if (rate >= 6) grade = 'A'
  else if (rate >= 3) grade = 'B'
  else if (rate >= 1.5) grade = 'C'
  else if (rate >= 0.5) grade = 'D'

  return { total, rate, virality, sentiment, grade }
}

// ============================================
// EXTRACT METRICS FROM POST METADATA
// ============================================

function extractMetrics(metadata: any): EngagementMetrics {
  const m = metadata?.engagement || metadata?.metrics || metadata || {}
  return {
    views: m.views || 0,
    likes: m.likes || 0,
    comments: m.comments || 0,
    shares: m.shares || 0,
    clicks: m.clicks || 0,
    saves: m.saves || 0,
    reach: m.reach || 0,
    impressions: m.impressions || m.views || 0,
  }
}

// ============================================
// SIMULATE ENGAGEMENT (for demo/preview)
// ============================================

export function simulateEngagement(
  contentType: string,
  platform: string,
  characterRole: string
): EngagementMetrics {
  const baseMultipliers: Record<string, number> = {
    twitter: 1.2, instagram: 1.5, tiktok: 2.0,
    linkedin: 0.8, youtube: 1.8, blog: 0.6,
  }
  const roleMultipliers: Record<string, number> = {
    protagonist: 1.5, hype: 1.3, contrarian: 1.1,
    educator: 1.0, lurker: 0.7, villain: 0.9,
    sidekick: 0.8, wildcard: 1.2,
  }
  const typeMultipliers: Record<string, number> = {
    post: 1.0, thread: 1.3, story: 1.5,
    reel: 2.0, campaign: 1.4, reply: 0.6,
    collaboration: 1.6,
  }

  const pMult = baseMultipliers[platform.toLowerCase()] || 1.0
  const rMult = roleMultipliers[characterRole.toLowerCase()] || 1.0
  const tMult = typeMultipliers[contentType.toLowerCase()] || 1.0
  const combined = pMult * rMult * tMult

  const jitter = () => 0.7 + Math.random() * 0.6

  const views = Math.round(500 * combined * jitter())
  const impressions = Math.round(views * (1.2 + Math.random() * 0.8))
  const likes = Math.round(views * 0.08 * jitter())
  const comments = Math.round(views * 0.02 * jitter())
  const shares = Math.round(views * 0.01 * jitter())
  const clicks = Math.round(views * 0.03 * jitter())
  const saves = Math.round(views * 0.015 * jitter())
  const reach = Math.round(impressions * 0.7 * jitter())

  return { views, likes, comments, shares, clicks, saves, reach, impressions }
}

// ============================================
// GET ANALYTICS SUMMARY
// ============================================

export async function getAnalyticsSummary(projectId: string): Promise<AnalyticsSummary> {
  const [posts, characters, project] = await Promise.all([
    db.orbitPost.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    }),
    db.orbitCharacter.findMany({
      where: { projectId, isActive: true },
    }),
    db.orbitProject.findFirst({
      where: { id: projectId },
    }),
  ])

  const publishedPosts = posts.filter((p: any) => p.status === 'published')
  const campaignPosts = posts.filter((p: any) =>
    (p.metadata as any)?.campaignId || p.contentType === 'campaign'
  )

  // Character performance
  const characterPerformance: CharacterPerformance[] = characters.map((char: any) => {
    const charPosts = posts.filter((p: any) => p.characterId === char.id)
    const charPublished = charPosts.filter((p: any) => p.status === 'published')

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0
    let totalScore = 0
    let topPost: CharacterPerformance['topPost'] = null

    const contentBreakdown: Record<string, number> = {}
    const platformBreakdown: Record<string, number> = {}

    charPosts.forEach((p: any) => {
      const metrics = extractMetrics(p.metadata)
      const score = calculateEngagementScore(metrics)
      totalViews += metrics.views
      totalLikes += metrics.likes
      totalComments += metrics.comments
      totalShares += metrics.shares
      totalScore += score.total

      contentBreakdown[p.contentType] = (contentBreakdown[p.contentType] || 0) + 1
      platformBreakdown[p.platform] = (platformBreakdown[p.platform] || 0) + 1

      if (!topPost || score.total > topPost.score) {
        topPost = {
          id: p.id,
          content: (p.content || '').substring(0, 100),
          score: score.total,
        }
      }
    })

    const avgScore = charPosts.length > 0 ? Math.round(totalScore / charPosts.length) : 0
    const engagementRate = totalViews > 0
      ? parseFloat(((totalLikes + totalComments + totalShares) / totalViews * 100).toFixed(2))
      : 0

    // Trend: compare last 7 days vs previous 7 days
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)
    const recentPosts = charPosts.filter((p: any) => new Date(p.createdAt) >= weekAgo)
    const prevPosts = charPosts.filter((p: any) => {
      const d = new Date(p.createdAt)
      return d >= twoWeeksAgo && d < weekAgo
    })
    const recentScore = recentPosts.reduce((sum: number, p: any) => {
      return sum + calculateEngagementScore(extractMetrics(p.metadata)).total
    }, 0)
    const prevScore = prevPosts.reduce((sum: number, p: any) => {
      return sum + calculateEngagementScore(extractMetrics(p.metadata)).total
    }, 0)

    let trend: 'up' | 'down' | 'stable' = 'stable'
    let trendPercent = 0
    if (prevScore > 0) {
      trendPercent = Math.round(((recentScore - prevScore) / prevScore) * 100)
      trend = trendPercent > 5 ? 'up' : trendPercent < -5 ? 'down' : 'stable'
    } else if (recentScore > 0) {
      trend = 'up'
      trendPercent = 100
    }

    return {
      characterId: char.id,
      characterName: char.name,
      roleType: char.roleType,
      totalPosts: charPosts.length,
      publishedPosts: charPublished.length,
      avgEngagementScore: avgScore,
      totalViews, totalLikes, totalComments, totalShares,
      engagementRate, topPost,
      contentBreakdown, platformBreakdown,
      trend, trendPercent,
    }
  })

  // Platform analytics
  const platformMap: Record<string, any[]> = {}
  posts.forEach((p: any) => {
    const plat = p.platform || 'unknown'
    if (!platformMap[plat]) platformMap[plat] = []
    platformMap[plat].push(p)
  })

  const platformAnalytics: PlatformAnalytics[] = Object.entries(platformMap).map(([platform, pPosts]) => {
    let totalEng = 0
    const typeCount: Record<string, number> = {}
    const dayCount: Record<string, number> = {}

    pPosts.forEach((p: any) => {
      const metrics = extractMetrics(p.metadata)
      totalEng += calculateEngagementScore(metrics).total
      typeCount[p.contentType] = (typeCount[p.contentType] || 0) + 1
      const day = new Date(p.createdAt).toLocaleDateString('en-US', { weekday: 'long' })
      dayCount[day] = (dayCount[day] || 0) + 1
    })

    const bestContentType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'post'
    const peakDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Monday'

    return {
      platform,
      totalPosts: pPosts.length,
      avgEngagement: pPosts.length > 0 ? Math.round(totalEng / pPosts.length) : 0,
      bestContentType,
      peakDay,
      trend: 'stable' as const,
    }
  })

  // Content type analytics
  const typeMap: Record<string, any[]> = {}
  posts.forEach((p: any) => {
    const ct = p.contentType || 'post'
    if (!typeMap[ct]) typeMap[ct] = []
    typeMap[ct].push(p)
  })

  const contentTypeAnalytics: ContentTypeAnalytics[] = Object.entries(typeMap).map(([contentType, tPosts]) => {
    let totalEng = 0, totalViews = 0
    const platCount: Record<string, number> = {}

    tPosts.forEach((p: any) => {
      const metrics = extractMetrics(p.metadata)
      totalEng += calculateEngagementScore(metrics).total
      totalViews += metrics.views
      platCount[p.platform] = (platCount[p.platform] || 0) + 1
    })

    const topPlatform = Object.entries(platCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'twitter'

    return {
      contentType,
      totalPosts: tPosts.length,
      avgEngagement: tPosts.length > 0 ? Math.round(totalEng / tPosts.length) : 0,
      avgViews: tPosts.length > 0 ? Math.round(totalViews / tPosts.length) : 0,
      topPlatform,
      trend: 'stable' as const,
    }
  })

  // Campaign analytics
  const campaignMap: Record<string, any[]> = {}
  campaignPosts.forEach((p: any) => {
    const cId = (p.metadata as any)?.campaignId || p.id
    if (!campaignMap[cId]) campaignMap[cId] = []
    campaignMap[cId].push(p)
  })

  const campaignAnalytics: CampaignAnalytics[] = Object.entries(campaignMap).map(([campaignId, cPosts]) => {
    let totalEng = 0
    const charMap: Record<string, { name: string; posts: number; engagement: number }> = {}

    cPosts.forEach((p: any) => {
      const metrics = extractMetrics(p.metadata)
      const score = calculateEngagementScore(metrics)
      totalEng += score.total

      const char = characters.find((c: any) => c.id === p.characterId)
      const charName = char?.name || 'Unknown'
      if (!charMap[p.characterId]) charMap[p.characterId] = { name: charName, posts: 0, engagement: 0 }
      charMap[p.characterId].posts += 1
      charMap[p.characterId].engagement += score.total
    })

    const masterPost = cPosts.find((p: any) => p.contentType === 'campaign')
    const published = cPosts.filter((p: any) => p.status === 'published')
    const charBreakdown = Object.values(charMap).sort((a, b) => b.engagement - a.engagement)

    return {
      campaignId,
      campaignName: (masterPost?.metadata as any)?.campaignName || 'Unnamed Campaign',
      totalPosts: cPosts.length,
      publishedPosts: published.length,
      totalEngagement: totalEng,
      avgEngagementRate: cPosts.length > 0 ? parseFloat((totalEng / cPosts.length).toFixed(1)) : 0,
      topPerformer: charBreakdown[0]?.name || 'N/A',
      characterBreakdown: charBreakdown,
    }
  })

  // Overview totals
  let grandTotalEng = 0, grandTotalReach = 0
  const dayEngMap: Record<string, number> = {}
  posts.forEach((p: any) => {
    const metrics = extractMetrics(p.metadata)
    grandTotalEng += calculateEngagementScore(metrics).total
    grandTotalReach += metrics.reach
    const day = new Date(p.createdAt).toLocaleDateString('en-US', { weekday: 'long' })
    dayEngMap[day] = (dayEngMap[day] || 0) + calculateEngagementScore(metrics).total
  })
  const bestDay = Object.entries(dayEngMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

  // Recent trends (7d vs 14d)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)
  const recent = posts.filter((p: any) => new Date(p.createdAt) >= weekAgo)
  const prev = posts.filter((p: any) => {
    const d = new Date(p.createdAt)
    return d >= twoWeeksAgo && d < weekAgo
  })

  const recentEng = recent.reduce((s: number, p: any) => s + calculateEngagementScore(extractMetrics(p.metadata)).total, 0)
  const prevEng = prev.reduce((s: number, p: any) => s + calculateEngagementScore(extractMetrics(p.metadata)).total, 0)
  const recentReach = recent.reduce((s: number, p: any) => s + extractMetrics(p.metadata).reach, 0)
  const prevReach = prev.reduce((s: number, p: any) => s + extractMetrics(p.metadata).reach, 0)

  const pctChange = (curr: number, previous: number) =>
    previous > 0 ? Math.round(((curr - previous) / previous) * 100) : curr > 0 ? 100 : 0

  const uniqueCampaignIds = new Set(campaignPosts.map((p: any) => (p.metadata as any)?.campaignId).filter(Boolean))

  return {
    overview: {
      totalPosts: posts.length,
      publishedPosts: publishedPosts.length,
      totalEngagement: grandTotalEng,
      avgEngagementRate: publishedPosts.length > 0
        ? parseFloat((grandTotalEng / publishedPosts.length).toFixed(1))
        : 0,
      totalReach: grandTotalReach,
      activeCharacters: characters.length,
      activeCampaigns: uniqueCampaignIds.size,
      bestDay,
    },
    characterPerformance,
    platformAnalytics,
    contentTypeAnalytics,
    campaignAnalytics,
    recentTrends: {
      period: '7d',
      engagementChange: pctChange(recentEng, prevEng),
      reachChange: pctChange(recentReach, prevReach),
      postFrequencyChange: pctChange(recent.length, prev.length),
    },
    aiInsights: [],
  }
}

// ============================================
// GENERATE AI INSIGHTS
// ============================================

export async function generateAIInsights(summary: AnalyticsSummary): Promise<string[]> {
  const topChars = summary.characterPerformance
    .sort((a, b) => b.avgEngagementScore - a.avgEngagementScore)
    .slice(0, 3)

  const systemPrompt = 'You are a social media analytics expert. Analyze the performance data and provide 4-6 short, actionable insights. Each insight should be 1-2 sentences max. Return ONLY a JSON array of strings.'

  const dataSnapshot = {
    totalPosts: summary.overview.totalPosts,
    publishedPosts: summary.overview.publishedPosts,
    avgEngagementRate: summary.overview.avgEngagementRate,
    totalReach: summary.overview.totalReach,
    trends: summary.recentTrends,
    topCharacters: topChars.map(c => ({
      name: c.characterName,
      role: c.roleType,
      score: c.avgEngagementScore,
      rate: c.engagementRate,
      trend: c.trend,
    })),
    platforms: summary.platformAnalytics.map(p => ({
      name: p.platform,
      posts: p.totalPosts,
      avgEng: p.avgEngagement,
      bestType: p.bestContentType,
    })),
    contentTypes: summary.contentTypeAnalytics.map(ct => ({
      type: ct.contentType,
      posts: ct.totalPosts,
      avgEng: ct.avgEngagement,
    })),
    campaigns: summary.campaignAnalytics.length,
  }

  const response = await callLLM(systemPrompt, [
    { role: 'user', content: 'Analyze this Orbit network performance data and give me actionable insights:\n' + JSON.stringify(dataSnapshot, null, 2) },
  ], { maxTokens: 500, temperature: 0.7 })

  try {
    const parsed = JSON.parse(response.content)
    if (Array.isArray(parsed)) return parsed.slice(0, 6)
    return ['Unable to parse AI insights.']
  } catch {
    const lines = response.content.split('\n').filter((l: string) => l.trim().length > 10)
    return lines.slice(0, 6)
  }
}

// ============================================
// RECORD ENGAGEMENT (update post metadata)
// ============================================

export async function recordEngagement(
  postId: string,
  metrics: Partial<EngagementMetrics>
): Promise<void> {
  const post = await db.orbitPost.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  const existing = extractMetrics(post.metadata)
  const updated = {
    ...existing,
    ...metrics,
  }

  await db.orbitPost.update({
    where: { id: postId },
    data: {
      metadata: {
        ...((post.metadata as any) || {}),
        engagement: updated,
        lastMetricsUpdate: new Date().toISOString(),
      } as any,
    },
  })
}

// ============================================
// SEED DEMO METRICS (for testing/preview)
// ============================================

export async function seedDemoMetrics(projectId: string): Promise<number> {
  const posts = await db.orbitPost.findMany({ where: { projectId } })
  const characters = await db.orbitCharacter.findMany({ where: { projectId } })
  const charMap = new Map(characters.map((c: any) => [c.id, c]))

  let seeded = 0
  for (const post of posts) {
    const char = charMap.get(post.characterId)
    const metrics = simulateEngagement(
      post.contentType || 'post',
      post.platform || 'twitter',
      char?.roleType || 'protagonist'
    )

    await db.orbitPost.update({
      where: { id: post.id },
      data: {
        metadata: {
          ...((post.metadata as any) || {}),
          engagement: metrics,
          lastMetricsUpdate: new Date().toISOString(),
        } as any,
      },
    })
    seeded++
  }

  return seeded
}
