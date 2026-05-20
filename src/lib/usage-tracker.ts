// Usage Tracker
// Logs every API action for analytics and rate limiting
// Called by chat route, feed gen, notification gen, etc.

import { db } from './db'

type UsageAction = 'chat' | 'feed_gen' | 'notification' | 'search' | 'vision'

export async function logUsage(
  userId: string,
  action: UsageAction,
  tokens: number = 0,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.usageLog.create({
      data: {
        userId,
        action,
        tokens,
        metadata: JSON.stringify(metadata),
      },
    })
  } catch (error) {
    // Usage logging is non-critical — don't break the request
    console.error('[Usage] Log failed:', error)
  }
}

// Get usage summary for a user (for profile/settings display)
export async function getUserUsageSummary(userId: string) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [todayMessages, monthMessages, monthTokens] = await Promise.all([
    db.usageLog.count({
      where: { userId, action: 'chat', createdAt: { gte: todayStart } },
    }),
    db.usageLog.count({
      where: { userId, action: 'chat', createdAt: { gte: monthStart } },
    }),
    db.usageLog.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { tokens: true },
    }),
  ])

  return {
    todayMessages,
    monthMessages,
    monthTokens: monthTokens._sum.tokens || 0,
  }
}
