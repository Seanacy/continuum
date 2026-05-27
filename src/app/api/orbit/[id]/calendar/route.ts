// ============================================
// ORBIT CALENDAR API
// ============================================
// GET: Retrieve calendar events with filters
// POST: Schedule, reschedule, cancel, bulk ops,
//       AI suggestions, seed demo data
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  getCalendarEvents,
  schedulePost,
  reschedulePost,
  cancelScheduledPost,
  detectConflicts,
  getOptimalTimeSlots,
  getWeeklyOverview,
  generateAICalendarSuggestions,
  bulkSchedule,
  seedDemoCalendar,
} from '@/lib/orbit-calendar'

// ============================================
// GET â Fetch calendar events
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
    const view = searchParams.get('view') || 'events' // events | week | optimal | conflicts
    const startDate = searchParams.get('startDate') || new Date().toISOString()
    const endDate = searchParams.get('endDate') || new Date(Date.now() + 7 * 86400000).toISOString()
    const characterIds = searchParams.get('characterIds')?.split(',').filter(Boolean)
    const platforms = searchParams.get('platforms')?.split(',').filter(Boolean)
    const statuses = searchParams.get('statuses')?.split(',').filter(Boolean)

    if (view === 'week') {
      const overview = await getWeeklyOverview(projectId, startDate)
      return NextResponse.json(overview)
    }

    if (view === 'optimal') {
      const platform = searchParams.get('platform') || 'instagram'
      const count = parseInt(searchParams.get('count') || '7')
      const slots = getOptimalTimeSlots(platform, count)
      return NextResponse.json({ slots })
    }

    if (view === 'conflicts') {
      const characterId = searchParams.get('characterId')
      const platform = searchParams.get('platform')
      const scheduledAt = searchParams.get('scheduledAt')
      if (!characterId || !platform || !scheduledAt) {
        return NextResponse.json({ error: 'characterId, platform, and scheduledAt required' }, { status: 400 })
      }
      const result = await detectConflicts(projectId, {
        characterId,
        platform,
        contentType: 'post',
        title: '',
        scheduledAt,
      })
      return NextResponse.json(result)
    }

    // Default: get events
    const events = await getCalendarEvents(projectId, {
      startDate,
      endDate,
      characterIds,
      platforms,
      statuses,
    })

    return NextResponse.json({ events, count: events.length })
  } catch (error) {
    console.error('Calendar GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 })
  }
}

// ============================================
// POST â Calendar actions
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

    // ---- Schedule a post ----
    if (action === 'schedule') {
      const { characterId, platform, contentType, title, scheduledAt, duration, recurrence, postId, metadata } = body
      if (!characterId || !platform || !title || !scheduledAt) {
        return NextResponse.json({ error: 'characterId, platform, title, and scheduledAt required' }, { status: 400 })
      }
      const event = await schedulePost(projectId, {
        characterId,
        platform,
        contentType: contentType || 'post',
        title,
        scheduledAt,
        duration,
        recurrence,
        postId,
        metadata,
      })
      return NextResponse.json({ event })
    }

    // ---- Reschedule ----
    if (action === 'reschedule') {
      const { postId, newScheduledAt } = body
      if (!postId || !newScheduledAt) {
        return NextResponse.json({ error: 'postId and newScheduledAt required' }, { status: 400 })
      }
      await reschedulePost(postId, newScheduledAt)
      return NextResponse.json({ success: true })
    }

    // ---- Cancel ----
    if (action === 'cancel') {
      const { postId } = body
      if (!postId) {
        return NextResponse.json({ error: 'postId required' }, { status: 400 })
      }
      await cancelScheduledPost(postId)
      return NextResponse.json({ success: true })
    }

    // ---- Bulk schedule ----
    if (action === 'bulk_schedule') {
      const { requests } = body
      if (!requests || !Array.isArray(requests)) {
        return NextResponse.json({ error: 'requests array required' }, { status: 400 })
      }
      const events = await bulkSchedule(projectId, requests)
      return NextResponse.json({ events, count: events.length })
    }

    // ---- AI suggestions ----
    if (action === 'suggestions') {
      const { weekStartDate } = body
      const startDate = weekStartDate || new Date().toISOString()
      const suggestions = await generateAICalendarSuggestions(projectId, startDate)
      return NextResponse.json({ suggestions })
    }

    // ---- Seed demo data ----
    if (action === 'seed_demo') {
      const count = await seedDemoCalendar(projectId)
      return NextResponse.json({ success: true, scheduled: count })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Calendar POST error:', error)
    return NextResponse.json({ error: 'Failed to process calendar action' }, { status: 500 })
  }
}
