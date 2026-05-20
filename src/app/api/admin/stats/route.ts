import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Admin-only: overall platform stats
export async function GET() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const fullUser = await db.user.findUnique({
    where: { id: currentUser.id },
    select: { isAdmin: true },
  })

  if (!fullUser?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 7)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [
    totalUsers,
    freeUsers,
    proUsers,
    totalMessages,
    todayMessages,
    weekMessages,
    monthTokens,
    totalMemories,
    totalThreads,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { tier: 'free' } }),
    db.user.count({ where: { tier: 'pro' } }),
    db.message.count(),
    db.usageLog.count({ where: { action: 'chat', createdAt: { gte: todayStart } } }),
    db.usageLog.count({ where: { action: 'chat', createdAt: { gte: weekStart } } }),
    db.usageLog.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { tokens: true },
    }),
    db.memory.count(),
    db.thread.count(),
  ])

  return NextResponse.json({
    totalUsers,
    freeUsers,
    proUsers,
    totalMessages,
    todayMessages,
    weekMessages,
    monthTokens: monthTokens._sum.tokens || 0,
    totalMemories,
    totalThreads,
  })
}
