// ============================================
// ORBIT CALENDAR â Content Scheduling Engine
// ============================================
// Manages post scheduling, time slot optimization,
// recurrence patterns, conflict detection, and
// AI-powered content calendar generation.
// ============================================

import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'

// ============================================
// TYPES
// ============================================

export interface CalendarEvent {
  id: string
  postId?: string
  characterId: string
  characterName: string
  platform: string
  contentType: string
  title: string
  scheduledAt: string // ISO datetime
  duration: number // minutes
  status: 'scheduled' | 'published' | 'draft' | 'failed' | 'cancelled'
  recurrence?: RecurrenceRule
  color: string
  metadata?: Record<string, any>
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  interval: number
  daysOfWeek?: number[] // 0=Sun, 6=Sat
  endDate?: string
  maxOccurrences?: number
}

export interface TimeSlot {
  dayOfWeek: number
  hour: number
  minute: number
  score: number // 0-100 engagement prediction
  platform: string
  reason: string
}

export interface ScheduleRequest {
  characterId: string
  platform: string
  contentType: string
  title: string
  scheduledAt: string
  duration?: number
  recurrence?: RecurrenceRule
  postId?: string
  metadata?: Record<string, any>
}

export interface CalendarFilter {
  startDate: string
  endDate: string
  characterIds?: string[]
  platforms?: string[]
  statuses?: string[]
}

export interface ConflictResult {
  hasConflict: boolean
  conflicts: Array<{
    event: CalendarEvent
    overlapMinutes: number
    suggestion: string
  }>
}

export interface WeeklyOverview {
  weekStart: string
  weekEnd: string
  totalScheduled: number
  byCharacter: Array<{
    characterId: string
    characterName: string
    count: number
    platforms: string[]
  }>
  byPlatform: Array<{
    platform: string
    count: number
  }>
  byDay: Array<{
    date: string
    dayName: string
    count: number
    events: CalendarEvent[]
  }>
  gaps: Array<{
    date: string
    suggestion: string
  }>
}

export interface CalendarSuggestion {
  characterId: string
  characterName: string
  platform: string
  contentType: string
  suggestedTime: string
  reason: string
  score: number
}

// ============================================
// CHARACTER COLORS
// ============================================

const CHARACTER_COLORS = [
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#ec4899', // pink
  '#3b82f6', // blue
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
]

function getCharacterColor(index: number): string {
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length]
}

// ============================================
// OPTIMAL TIME SLOTS BY PLATFORM
// ============================================

const PLATFORM_OPTIMAL_TIMES: Record<string, Array<{ day: number; hour: number; minute: number; score: number; reason: string }>> = {
  instagram: [
    { day: 1, hour: 11, minute: 0, score: 92, reason: 'Monday lunch break peak' },
    { day: 2, hour: 10, minute: 0, score: 88, reason: 'Tuesday mid-morning engagement' },
    { day: 3, hour: 11, minute: 0, score: 95, reason: 'Wednesday highest overall engagement' },
    { day: 4, hour: 12, minute: 0, score: 87, reason: 'Thursday lunch hour scroll' },
    { day: 5, hour: 10, minute: 0, score: 90, reason: 'Friday morning mood boost' },
    { day: 6, hour: 9, minute: 0, score: 85, reason: 'Saturday morning browse' },
    { day: 0, hour: 10, minute: 0, score: 83, reason: 'Sunday relaxed scrolling' },
  ],
  twitter: [
    { day: 1, hour: 8, minute: 0, score: 90, reason: 'Monday morning news check' },
    { day: 2, hour: 9, minute: 0, score: 93, reason: 'Tuesday peak Twitter activity' },
    { day: 3, hour: 12, minute: 0, score: 91, reason: 'Wednesday lunch discussions' },
    { day: 4, hour: 9, minute: 0, score: 89, reason: 'Thursday morning trends' },
    { day: 5, hour: 8, minute: 0, score: 86, reason: 'Friday early engagement' },
    { day: 6, hour: 11, minute: 0, score: 78, reason: 'Saturday late morning' },
    { day: 0, hour: 14, minute: 0, score: 75, reason: 'Sunday afternoon browsing' },
  ],
  tiktok: [
    { day: 1, hour: 19, minute: 0, score: 88, reason: 'Monday evening scroll' },
    { day: 2, hour: 15, minute: 0, score: 94, reason: 'Tuesday afternoon peak' },
    { day: 3, hour: 19, minute: 0, score: 91, reason: 'Wednesday evening prime time' },
    { day: 4, hour: 12, minute: 0, score: 90, reason: 'Thursday lunch break viral window' },
    { day: 5, hour: 17, minute: 0, score: 93, reason: 'Friday evening entertainment rush' },
    { day: 6, hour: 11, minute: 0, score: 89, reason: 'Saturday morning discovery' },
    { day: 0, hour: 15, minute: 0, score: 87, reason: 'Sunday afternoon binge' },
  ],
  youtube: [
    { day: 1, hour: 14, minute: 0, score: 85, reason: 'Monday afternoon watch session' },
    { day: 2, hour: 15, minute: 0, score: 88, reason: 'Tuesday mid-afternoon' },
    { day: 3, hour: 14, minute: 0, score: 86, reason: 'Wednesday afternoon views' },
    { day: 4, hour: 15, minute: 0, score: 90, reason: 'Thursday best upload day' },
    { day: 5, hour: 15, minute: 0, score: 92, reason: 'Friday weekend anticipation' },
    { day: 6, hour: 10, minute: 0, score: 89, reason: 'Saturday morning binge' },
    { day: 0, hour: 10, minute: 0, score: 87, reason: 'Sunday morning watch party' },
  ],
  linkedin: [
    { day: 1, hour: 7, minute: 30, score: 88, reason: 'Monday early professional check' },
    { day: 2, hour: 10, minute: 0, score: 95, reason: 'Tuesday peak B2B engagement' },
    { day: 3, hour: 12, minute: 0, score: 92, reason: 'Wednesday lunch networking' },
    { day: 4, hour: 8, minute: 0, score: 90, reason: 'Thursday morning thought leadership' },
    { day: 5, hour: 9, minute: 0, score: 82, reason: 'Friday wrap-up engagement' },
    { day: 6, hour: 10, minute: 0, score: 60, reason: 'Saturday low but some activity' },
    { day: 0, hour: 10, minute: 0, score: 55, reason: 'Sunday minimal engagement' },
  ],
}

// ============================================
// CORE FUNCTIONS
// ============================================

export async function getCalendarEvents(
  projectId: string,
  filter: CalendarFilter
): Promise<CalendarEvent[]> {
  const posts = await db.orbitPost.findMany({
    where: {
      projectId,
      createdAt: {
        gte: new Date(filter.startDate),
        lte: new Date(filter.endDate),
      },
      ...(filter.characterIds?.length ? { characterId: { in: filter.characterIds } } : {}),
      ...(filter.platforms?.length ? { platform: { in: filter.platforms } } : {}),
    },
    include: {
      character: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const characters = await db.orbitCharacter.findMany({
    where: { projectId },
  })

  const characterIndexMap = new Map<string, number>()
  characters.forEach((c: any, i: number) => {
    characterIndexMap.set(c.id, i)
  })

  return posts.map((post: any) => {
    const meta = (post.metadata as any) || {}
    const schedule = meta.schedule || {}
    const scheduledAt = schedule.scheduledAt || post.createdAt.toISOString()
    const status = schedule.status || (post.status === 'published' ? 'published' : 'draft')

    return {
      id: `evt_${post.id}`,
      postId: post.id,
      characterId: post.characterId,
      characterName: post.character?.name || 'Unknown',
      platform: post.platform,
      contentType: post.contentType || 'post',
      title: (post.content as string || '').slice(0, 80) + ((post.content as string || '').length > 80 ? '...' : ''),
      scheduledAt,
      duration: schedule.duration || 30,
      status,
      recurrence: schedule.recurrence || undefined,
      color: getCharacterColor(characterIndexMap.get(post.characterId) || 0),
      metadata: meta,
    }
  })
}

export async function schedulePost(
  projectId: string,
  request: ScheduleRequest
): Promise<CalendarEvent> {
  // Check for conflicts first
  const conflictCheck = await detectConflicts(projectId, request)

  const characters = await db.orbitCharacter.findMany({
    where: { projectId },
  })
  const characterIndexMap = new Map<string, number>()
  characters.forEach((c: any, i: number) => {
    characterIndexMap.set(c.id, i)
  })

  const character = characters.find((c: any) => c.id === request.characterId) as any
  const characterName = character?.name || 'Unknown'

  if (request.postId) {
    // Update existing post with schedule
    const existing = await db.orbitPost.findUnique({
      where: { id: request.postId },
    })
    const existingMeta = ((existing as any)?.metadata as any) || {}

    await db.orbitPost.update({
      where: { id: request.postId },
      data: {
        metadata: {
          ...existingMeta,
          schedule: {
            scheduledAt: request.scheduledAt,
            duration: request.duration || 30,
            status: 'scheduled',
            recurrence: request.recurrence || null,
            updatedAt: new Date().toISOString(),
          },
        } as any,
      },
    })

    return {
      id: `evt_${request.postId}`,
      postId: request.postId,
      characterId: request.characterId,
      characterName,
      platform: request.platform,
      contentType: request.contentType,
      title: request.title,
      scheduledAt: request.scheduledAt,
      duration: request.duration || 30,
      status: 'scheduled',
      recurrence: request.recurrence,
      color: getCharacterColor(characterIndexMap.get(request.characterId) || 0),
      metadata: request.metadata,
    }
  } else {
    // Create new scheduled post
    const newPost = await db.orbitPost.create({
      data: {
        projectId,
        characterId: request.characterId,
        platform: request.platform,
        contentType: request.contentType || 'post',
        content: request.title,
        status: 'draft',
        metadata: {
          schedule: {
            scheduledAt: request.scheduledAt,
            duration: request.duration || 30,
            status: 'scheduled',
            recurrence: request.recurrence || null,
            createdAt: new Date().toISOString(),
          },
          ...(request.metadata || {}),
        } as any,
      },
    })

    return {
      id: `evt_${newPost.id}`,
      postId: newPost.id,
      characterId: request.characterId,
      characterName,
      platform: request.platform,
      contentType: request.contentType,
      title: request.title,
      scheduledAt: request.scheduledAt,
      duration: request.duration || 30,
      status: 'scheduled',
      recurrence: request.recurrence,
      color: getCharacterColor(characterIndexMap.get(request.characterId) || 0),
      metadata: request.metadata,
    }
  }
}

export async function reschedulePost(
  postId: string,
  newScheduledAt: string
): Promise<void> {
  const post = await db.orbitPost.findUnique({
    where: { id: postId },
  })
  if (!post) throw new Error('Post not found')

  const meta = ((post as any).metadata as any) || {}
  const schedule = meta.schedule || {}

  await db.orbitPost.update({
    where: { id: postId },
    data: {
      metadata: {
        ...meta,
        schedule: {
          ...schedule,
          scheduledAt: newScheduledAt,
          updatedAt: new Date().toISOString(),
        },
      } as any,
    },
  })
}

export async function cancelScheduledPost(postId: string): Promise<void> {
  const post = await db.orbitPost.findUnique({
    where: { id: postId },
  })
  if (!post) throw new Error('Post not found')

  const meta = ((post as any).metadata as any) || {}
  const schedule = meta.schedule || {}

  await db.orbitPost.update({
    where: { id: postId },
    data: {
      metadata: {
        ...meta,
        schedule: {
          ...schedule,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
        },
      } as any,
    },
  })
}

export async function detectConflicts(
  projectId: string,
  request: ScheduleRequest
): Promise<ConflictResult> {
  const requestStart = new Date(request.scheduledAt)
  const requestEnd = new Date(requestStart.getTime() + (request.duration || 30) * 60000)

  // Get events in a 24-hour window around the requested time
  const windowStart = new Date(requestStart.getTime() - 12 * 3600000)
  const windowEnd = new Date(requestEnd.getTime() + 12 * 3600000)

  const events = await getCalendarEvents(projectId, {
    startDate: windowStart.toISOString(),
    endDate: windowEnd.toISOString(),
  })

  const conflicts: ConflictResult['conflicts'] = []

  for (const event of events) {
    if (event.postId === request.postId) continue // Skip self
    if (event.status === 'cancelled') continue

    const eventStart = new Date(event.scheduledAt)
    const eventEnd = new Date(eventStart.getTime() + event.duration * 60000)

    // Same character + same platform within 2 hours = conflict
    if (
      event.characterId === request.characterId &&
      event.platform === request.platform
    ) {
      const gap = Math.abs(requestStart.getTime() - eventStart.getTime()) / 60000
      if (gap < 120) {
        const overlapMinutes = Math.max(0, Math.min(
          requestEnd.getTime() - eventStart.getTime(),
          eventEnd.getTime() - requestStart.getTime()
        ) / 60000)

        conflicts.push({
          event,
          overlapMinutes: Math.round(overlapMinutes),
          suggestion: gap < 30
            ? `Move at least 2 hours from "${event.title}" to avoid audience fatigue`
            : `Consider spacing ${Math.round(120 - gap)} more minutes from "${event.title}"`,
        })
      }
    }

    // Same platform, different character, exact time overlap = warning
    if (
      event.characterId !== request.characterId &&
      event.platform === request.platform &&
      requestStart < eventEnd &&
      requestEnd > eventStart
    ) {
      conflicts.push({
        event,
        overlapMinutes: 0,
        suggestion: `${event.characterName} also posts on ${event.platform} at this time â consider staggering by 30 min`,
      })
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  }
}

export function getOptimalTimeSlots(
  platform: string,
  count: number = 7
): TimeSlot[] {
  const platformKey = platform.toLowerCase()
  const slots = PLATFORM_OPTIMAL_TIMES[platformKey] || PLATFORM_OPTIMAL_TIMES.instagram

  return slots
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(s => ({
      dayOfWeek: s.day,
      hour: s.hour,
      minute: s.minute,
      score: s.score,
      platform,
      reason: s.reason,
    }))
}

export async function getWeeklyOverview(
  projectId: string,
  weekStartDate: string
): Promise<WeeklyOverview> {
  const start = new Date(weekStartDate)
  // Ensure we start on a Monday
  const dayOfWeek = start.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  start.setDate(start.getDate() + mondayOffset)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const events = await getCalendarEvents(projectId, {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  })

  const activeEvents = events.filter(e => e.status !== 'cancelled')

  // By character
  const charMap = new Map<string, { name: string; count: number; platforms: Set<string> }>()
  for (const e of activeEvents) {
    const existing = charMap.get(e.characterId) || { name: e.characterName, count: 0, platforms: new Set<string>() }
    existing.count++
    existing.platforms.add(e.platform)
    charMap.set(e.characterId, existing)
  }
  const byCharacter = Array.from(charMap.entries()).map(([id, data]) => ({
    characterId: id,
    characterName: data.name,
    count: data.count,
    platforms: Array.from(data.platforms),
  }))

  // By platform
  const platMap = new Map<string, number>()
  for (const e of activeEvents) {
    platMap.set(e.platform, (platMap.get(e.platform) || 0) + 1)
  }
  const byPlatform = Array.from(platMap.entries()).map(([platform, count]) => ({
    platform,
    count,
  }))

  // By day
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const byDay: WeeklyOverview['byDay'] = []
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(start)
    dayDate.setDate(dayDate.getDate() + i)
    const dateStr = dayDate.toISOString().split('T')[0]
    const dayEvents = activeEvents.filter(e => e.scheduledAt.startsWith(dateStr))
    byDay.push({
      date: dateStr,
      dayName: dayNames[dayDate.getDay()],
      count: dayEvents.length,
      events: dayEvents,
    })
  }

  // Identify gaps (days with 0 posts)
  const gaps = byDay
    .filter(d => d.count === 0)
    .map(d => ({
      date: d.date,
      suggestion: `No content scheduled for ${d.dayName} â consider adding a post to maintain consistency`,
    }))

  return {
    weekStart: start.toISOString().split('T')[0],
    weekEnd: end.toISOString().split('T')[0],
    totalScheduled: activeEvents.length,
    byCharacter,
    byPlatform,
    byDay,
    gaps,
  }
}

export async function generateAICalendarSuggestions(
  projectId: string,
  weekStartDate: string
): Promise<CalendarSuggestion[]> {
  const overview = await getWeeklyOverview(projectId, weekStartDate)

  const characters = await db.orbitCharacter.findMany({
    where: { projectId },
  })

  const characterInfo = characters.map((c: any) => ({
    id: c.id,
    name: c.name,
    role: (c as any).roleType || 'influencer',
    platforms: ((c.customizations as any)?.platforms) || ['instagram'],
  }))

  const systemPrompt = `You are a social media strategist optimizing a content calendar for an AI influencer network.
Analyze the current week's schedule and suggest optimal additions.
Return a JSON array of suggestions. Each suggestion:
{
  "characterId": "id",
  "characterName": "name",
  "platform": "platform",
  "contentType": "post|reel|story|thread|video",
  "suggestedTime": "ISO datetime string",
  "reason": "why this slot is good",
  "score": 0-100
}
Return ONLY valid JSON array, no markdown.`

  const userMessage = `Current week: ${overview.weekStart} to ${overview.weekEnd}
Total scheduled: ${overview.totalScheduled}

Characters: ${JSON.stringify(characterInfo, null, 2)}

Current schedule by day:
${overview.byDay.map(d => `${d.dayName} (${d.date}): ${d.count} posts${d.events.length > 0 ? ' â ' + d.events.map(e => `${e.characterName}/${e.platform} at ${new Date(e.scheduledAt).toLocaleTimeString()}`).join(', ') : ''}`).join('\n')}

Gaps: ${overview.gaps.map(g => g.date).join(', ') || 'None'}

Suggest 3-5 additional posts to fill gaps and maximize engagement. Use real ISO datetimes within the week range.`

  try {
    const response = await callLLM(systemPrompt, [{ role: 'user', content: userMessage }], {
      maxTokens: 2000,
      temperature: 0.7,
    })

    const text = response.content.trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const suggestions = JSON.parse(jsonMatch[0]) as CalendarSuggestion[]
    return suggestions.filter(s =>
      s.characterId && s.platform && s.suggestedTime && s.reason
    )
  } catch {
    return []
  }
}

export async function bulkSchedule(
  projectId: string,
  requests: ScheduleRequest[]
): Promise<CalendarEvent[]> {
  const results: CalendarEvent[] = []
  for (const req of requests) {
    const event = await schedulePost(projectId, req)
    results.push(event)
  }
  return results
}

// ============================================
// SEED DEMO CALENDAR DATA
// ============================================

export async function seedDemoCalendar(projectId: string): Promise<number> {
  const characters = await db.orbitCharacter.findMany({
    where: { projectId },
  })
  if (characters.length === 0) return 0

  const platforms = ['instagram', 'twitter', 'tiktok', 'youtube', 'linkedin']
  const contentTypes = ['post', 'reel', 'story', 'thread', 'video']
  const titles = [
    'Morning motivation drop',
    'Behind the scenes look',
    'Product review thread',
    'Trending topic take',
    'Community Q&A session',
    'Collaboration announcement',
    'Tutorial: Quick tips',
    'Industry news breakdown',
    'Personal story share',
    'Weekend vibes content',
    'Hot take on latest trend',
    'Fan appreciation post',
    'New content series launch',
    'Live session preview',
  ]

  const now = new Date()
  const monday = new Date(now)
  const dayOfWeek = monday.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  monday.setDate(monday.getDate() + mondayOffset)
  monday.setHours(0, 0, 0, 0)

  let scheduled = 0

  for (const character of characters) {
    const charPlatforms = ((character as any).customizations as any)?.platforms || ['instagram', 'twitter']
    const numPosts = 3 + Math.floor(Math.random() * 4) // 3-6 posts per character per week

    for (let i = 0; i < numPosts; i++) {
      const platform = charPlatforms[Math.floor(Math.random() * charPlatforms.length)] || platforms[Math.floor(Math.random() * platforms.length)]
      const optimalSlots = PLATFORM_OPTIMAL_TIMES[platform] || PLATFORM_OPTIMAL_TIMES.instagram
      const slot = optimalSlots[Math.floor(Math.random() * optimalSlots.length)]

      const postDate = new Date(monday)
      postDate.setDate(postDate.getDate() + slot.day)
      postDate.setHours(slot.hour, slot.minute + Math.floor(Math.random() * 30), 0, 0)

      // Add some jitter: +/- 1 hour
      postDate.setMinutes(postDate.getMinutes() + Math.floor(Math.random() * 120) - 60)

      const contentType = contentTypes[Math.floor(Math.random() * contentTypes.length)]
      const title = titles[Math.floor(Math.random() * titles.length)]

      await schedulePost(projectId, {
        characterId: (character as any).id,
        platform,
        contentType,
        title: `${title} #${scheduled + 1}`,
        scheduledAt: postDate.toISOString(),
        duration: 15 + Math.floor(Math.random() * 45),
      })

      scheduled++
    }
  }

  return scheduled
}
