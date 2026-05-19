import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limiter'
import { getUserUsageSummary } from '@/lib/usage-tracker'

export const dynamic = 'force-dynamic'

// Get current user's usage stats + rate limit info
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const [rateLimit, usage] = await Promise.all([
    checkRateLimit(user.id),
    getUserUsageSummary(user.id),
  ])

  return NextResponse.json({
    rateLimit: {
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
      used: rateLimit.used,
      resetsAt: rateLimit.resetsAt,
    },
    usage,
  })
}
