// ============================================
// ORBIT ANALYTICS API
// GET analytics summary, POST to record
// engagement or seed demo data
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  getAnalyticsSummary,
  generateAIInsights,
  recordEngagement,
  seedDemoMetrics,
  simulateEngagement,
  calculateEngagementScore,
} from '@/lib/orbit-analytics'

// ============================================
// GET — fetch analytics data
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = params.id
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'summary'
    const withInsights = searchParams.get('insights') === 'true'
    const characterId = searchParams.get('characterId')
    const platform = searchParams.get('platform')

    // Full analytics summary
    const summary = await getAnalyticsSummary(projectId)

    // Generate AI insights if requested
    if (withInsights && summary.overview.totalPosts > 0) {
      summary.aiInsights = await generateAIInsights(summary)
    }

    // Filter by character if specified
    if (characterId) {
      summary.characterPerformance = summary.characterPerformance
        .filter(c => c.characterId === characterId)
    }

    // Filter platform analytics if specified
    if (platform) {
      summary.platformAnalytics = summary.platformAnalytics
        .filter(p => p.platform === platform)
    }

    // Return specific view if requested
    if (view === 'characters') {
      return NextResponse.json({
        characters: summary.characterPerformance,
        overview: summary.overview,
      })
    }

    if (view === 'platforms') {
      return NextResponse.json({
        platforms: summary.platformAnalytics,
        overview: summary.overview,
      })
    }

    if (view === 'campaigns') {
      return NextResponse.json({
        campaigns: summary.campaignAnalytics,
        overview: summary.overview,
      })
    }

    if (view === 'content-types') {
      return NextResponse.json({
        contentTypes: summary.contentTypeAnalytics,
        overview: summary.overview,
      })
    }

    if (view === 'trends') {
      return NextResponse.json({
        trends: summary.recentTrends,
        overview: summary.overview,
      })
    }

    return NextResponse.json(summary)

  } catch (error: any) {
    console.error('[Orbit Analytics GET]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

// ============================================
// POST — record engagement or seed demo data
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = params.id
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action } = body

    // Record engagement for a specific post
    if (action === 'record_engagement') {
      const { postId, metrics } = body
      if (!postId) {
        return NextResponse.json({ error: 'postId required' }, { status: 400 })
      }
      await recordEngagement(postId, metrics)
      return NextResponse.json({ success: true, postId })
    }

    // Seed demo metrics for all posts in project
    if (action === 'seed_demo') {
      const seeded = await seedDemoMetrics(projectId)
      return NextResponse.json({ success: true, seeded })
    }

    // Simulate engagement for a hypothetical post
    if (action === 'simulate') {
      const { contentType, platform: plat, characterRole } = body
      const metrics = simulateEngagement(
        contentType || 'post',
        plat || 'twitter',
        characterRole || 'protagonist'
      )
      const score = calculateEngagementScore(metrics)
      return NextResponse.json({ metrics, score })
    }

    // Generate fresh AI insights
    if (action === 'insights') {
      const summary = await getAnalyticsSummary(projectId)
      const insights = await generateAIInsights(summary)
      return NextResponse.json({ insights })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (error: any) {
    console.error('[Orbit Analytics POST]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process analytics action' },
      { status: 500 }
    )
  }
}
