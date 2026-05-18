// Notification Engine
// Generates proactive AI pushes
// HARD RULE: max 2 notifications per user per day
// Every notification MUST reference a memory, thread, or state

import { db } from './db'
import { callLLM } from './llm'
import { getMemoryContext } from './memory-engine'
import { sendPushToUser } from './push-sender'

type NotificationType = 'memory_echo' | 'thread_nudge' | 'state_shift' | 'reflection'

const MAX_DAILY_NOTIFICATIONS = 2

// ============================================
// GENERATE — create notifications for a user
// Called by cron route (every 6-8h)
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
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return

  const candidates: Array<{
    type: NotificationType
    content: string
    referenceId: string | null
  }> = []

  // 1. Thread nudge — remind about stale active threads
  const threadNudge = await generateThreadNudge(userId)
  if (threadNudge) candidates.push(threadNudge)

  // 2. Memory-based reflection
  const reflection = await generateNotificationReflection(userId, user.aiName || 'Your AI')
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
      title: user.aiName || 'Your AI',
      body: notif.content,
      tag: `notif-${notif.type}`,
      url: '/home',
    }).catch((err) => console.error('[Push] Send failed:', err))
  }
}

// ============================================
// THREAD NUDGE — remind about open threads
// ============================================
async function generateThreadNudge(
  userId: string
): Promise<{ type: NotificationType; content: string; referenceId: string } | null> {
  const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days

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

  return {
    type: 'thread_nudge',
    content: `"${staleThread.title}" has been quiet for a few days.${staleThread.summary ? ` Last: ${staleThread.summary.slice(0, 80)}` : ''}`,
    referenceId: staleThread.id,
  }
}

// ============================================
// NOTIFICATION REFLECTION — short thought based on memory
// ============================================
async function generateNotificationReflection(
  userId: string,
  aiName: string
): Promise<{ type: NotificationType; content: string; referenceId: null } | null> {
  const memoryContext = await getMemoryContext(userId)
  if (!memoryContext || memoryContext.length < 100) return null

  // Don't send reflections too close together
  const recentReflection = await db.notification.findFirst({
    where: {
      userId,
      type: 'reflection',
      createdAt: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
  })

  if (recentReflection) return null

  try {
    const result = await callLLM(
      `You are ${aiName}. Write a VERY short push notification (max 15 words) that naturally references something you know about this person. It should feel like a quick thought — not a question, not a greeting. Something that makes them want to open the app.

Examples of good notifications:
- "That deadline you mentioned is tomorrow."
- "Thinking about what you said about the job switch."
- "Your morning runs have been consistent this week."

Memory context:
${memoryContext}`,
      [{ role: 'user', content: 'Generate notification.' }],
      { maxTokens: 50, temperature: 0.8 }
    )

    const content = result.content.trim().replace(/^["']|["']$/g, '') // strip quotes

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
