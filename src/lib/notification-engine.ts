// Notification Engine
// Generates proactive AI pushes
// HARD RULE: max 2 notifications per user per day
// Every notification MUST reference a memory, thread, or state
// Now powered by Continuity Orchestrator — tier-aware, discovery-informed

import { db } from './db'
import { callLLM } from './llm'
import { sendPushToUser } from './push-sender'
import { buildUnifiedContext, type UnifiedContext } from './continuity-orchestrator'

type NotificationType = 'memory_echo' | 'thread_nudge' | 'state_shift' | 'reflection' | 'absence_check'

const MAX_DAILY_NOTIFICATIONS = 2

// ============================================
// GENERATE — create notifications for a user
// ============================================
export async function generateNotifications(userId: string): Promise<void> {
  // Check daily limit
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayCount = await db.notification.count({
    where: {
      userId,
      createdAt: { gte: todayStart },
    },
  })

  if (todayCount >= MAX_DAILY_NOTIFICATIONS) return

  const remaining = MAX_DAILY_NOTIFICATIONS - todayCount

  // Build unified context
  const ctx = await buildUnifiedContext(userId)

  const candidates: Array<{
    type: NotificationType
    content: string
    referenceId: string | null
  }> = []

  // 1. Absence check — if they've been gone and relationship is deep enough
  const absenceCheck = generateAbsenceCheck(ctx)
  if (absenceCheck) candidates.push(absenceCheck)

  // 2. Thread nudge — remind about stale active threads
  const threadNudge = await generateThreadNudge(userId, ctx)
  if (threadNudge) candidates.push(threadNudge)

  // 3. Context-aware reflection
  const reflection = await generateContextReflection(ctx)
  if (reflection) candidates.push(reflection)

  // Save up to remaining limit
  const toSave = candidates.slice(0, remaining)
  for (const notif of toSave) {
    await db.notification.create({
      data: {
        userId,
        content: notif.content,
        type: notif.type,
        referenceId: notif.referenceId,
      },
    })

    // Also send as push notification
    await sendPushToUser(userId, {
      title: ctx.aiName,
      body: notif.content,
      tag: `notif-${notif.type}`,
      url: '/home',
    }).catch((err) => console.error('[Push] Send failed:', err))
  }
}

// ============================================
// ABSENCE CHECK — only for acquaintance+ relationships
// Strangers don't get "hey where'd you go" messages
// ============================================
function generateAbsenceCheck(ctx: UnifiedContext): {
  type: NotificationType
  content: string
  referenceId: string | null
} | null {
  const daysSince = ctx.engagement.daysSinceLastVisit

  // Don't bug strangers
  if (ctx.tier === 'stranger') return null

  // Only trigger after 3+ days absent
  if (daysSince < 3) return null

  // Tier-appropriate absence messages
  if (ctx.tier === 'acquaintance' && daysSince >= 5) {
    return {
      type: 'absence_check',
      content: `It's been a few days. No pressure — just here when you want to talk.`,
      referenceId: null,
    }
  }

  if (ctx.tier === 'friend' && daysSince >= 3) {
    // Reference something specific if we can
    if (ctx.activeThreads.length > 0) {
      const thread = ctx.activeThreads[0]
      return {
        type: 'absence_check',
        content: `Haven't heard from you in a bit. Still thinking about "${thread.title}."`,
        referenceId: thread.id,
      }
    }
    return {
      type: 'absence_check',
      content: `You've been quiet. Everything good?`,
      referenceId: null,
    }
  }

  if ((ctx.tier === 'close' || ctx.tier === 'inner_circle') && daysSince >= 3) {
    // For close relationships, be more direct and personal
    if (ctx.discoveryInsights.length > 0) {
      // Reference something from discovery
      return {
        type: 'absence_check',
        content: `${daysSince} days. That's not like you. What's going on?`,
        referenceId: null,
      }
    }
    return {
      type: 'absence_check',
      content: `Hey. It's been ${daysSince} days. Just checking.`,
      referenceId: null,
    }
  }

  return null
}

// ============================================
// THREAD NUDGE — remind about open threads
// Now tier-aware
// ============================================
async function generateThreadNudge(
  userId: string,
  ctx: UnifiedContext
): Promise<{ type: NotificationType; content: string; referenceId: string } | null> {
  const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const staleThread = await db.thread.findFirst({
    where: {
      userId,
      status: 'active',
      updatedAt: { lt: staleThreshold },
    },
    orderBy: { updatedAt: 'asc' },
  })

  if (!staleThread) return null

  // Don't nudge the same thread within 2 days
  const recentNudge = await db.notification.findFirst({
    where: {
      userId,
      type: 'thread_nudge',
      referenceId: staleThread.id,
      createdAt: { gt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    },
  })

  if (recentNudge) return null

  // For deeper relationships, generate a more personal nudge
  if (ctx.tier === 'friend' || ctx.tier === 'close' || ctx.tier === 'inner_circle') {
    try {
      const result = await callLLM(
        `You are ${ctx.aiName}. Write a VERY short push notification (max 12 words) about a stale conversation thread: "${staleThread.title}."${staleThread.summary ? ` Context: ${staleThread.summary}` : ''}

${ctx.fullContextBlock}

Make it personal and specific. Don't say "just checking in." Reference something from the thread or from what you know about them.`,
        [{ role: 'user', content: 'Generate thread nudge notification.' }],
        { maxTokens: 40, temperature: 0.8 }
      )

      return {
        type: 'thread_nudge',
        content: result.content.trim().replace(/^["']|["']$/g, ''),
        referenceId: staleThread.id,
      }
    } catch {
      // Fall through to simple version
    }
  }

  return {
    type: 'thread_nudge',
    content: `"${staleThread.title}" has been quiet for a few days.${staleThread.summary ? ` Last: ${staleThread.summary.slice(0, 80)}` : ''}`,
    referenceId: staleThread.id,
  }
}

// ============================================
// CONTEXT REFLECTION — short thought based on full context
// Uses orchestrator so it can reference discovery answers, threads, etc.
// ============================================
async function generateContextReflection(
  ctx: UnifiedContext
): Promise<{ type: NotificationType; content: string; referenceId: null } | null> {
  if (!ctx.memoryBlock || ctx.memoryBlock.length < 100) return null

  // Don't send reflections too close together
  const recentReflection = await db.notification.findFirst({
    where: {
      userId: ctx.userId,
      type: 'reflection',
      createdAt: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
  })

  if (recentReflection) return null

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}. Write a VERY short push notification (max 15 words) that makes this person want to open the app. It should reference something specific you know about them.

${ctx.fullContextBlock}

Rules:
- Not a question. Not a greeting. A thought.
- Reference a memory, a discovery answer, a thread, or a pattern.
- Match depth to relationship: light for new relationships, direct for deep ones.
- Examples: "That deadline is tomorrow." / "You always get like this in spring." / "Still thinking about what you said about proving yourself."`,
      [{ role: 'user', content: 'Generate notification.' }],
      { maxTokens: 50, temperature: 0.8 }
    )

    const content = result.content.trim().replace(/^["']|["']$/g, '')

    return {
      type: 'reflection',
      content,
      referenceId: null,
    }
  } catch {
    return null
  }
}

// ============================================
// RUN ALL — called by cron endpoint
// ============================================
export async function runNotificationGeneration(): Promise<{ processed: number }> {
  const users = await db.user.findMany({ select: { id: true } })
  let processed = 0

  for (const user of users) {
    try {
      await generateNotifications(user.id)
      processed++
    } catch (error) {
      console.error(`Notification gen failed for ${user.id}:`, error)
    }
  }

  return { processed }
}
