// Rate Limiter
// Enforces daily message limits per user based on subscription tier
// Free: 25 messages/day | Pro: unlimited

import { db } from './db'

const LIMITS: Record<string, number> = {
  free: 25,
  pro: Infinity,
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  used: number
  resetsAt: Date
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  // Get user tier
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  })

  const tier = user?.tier || 'free'
  const limit = LIMITS[tier] ?? LIMITS.free

  // If pro (unlimited), skip the count query
  if (limit === Infinity) {
    return { allowed: true, remaining: Infinity, limit, used: 0, resetsAt: getResetTime() }
  }

  // Count today's chat messages
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const used = await db.usageLog.count({
    where: {
      userId,
      action: 'chat',
      createdAt: { gte: todayStart },
    },
  })

  const remaining = Math.max(0, limit - used)

  return {
    allowed: used < limit,
    remaining,
    limit,
    used,
    resetsAt: getResetTime(),
  }
}

function getResetTime(): Date {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
}
