import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Admin-only: list all users with usage stats
export async function GET() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Check admin flag
  const fullUser = await db.user.findUnique({
    where: { id: currentUser.id },
    select: { isAdmin: true },
  })

  if (!fullUser?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // Get all users with aggregated stats
  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      aiName: true,
      tier: true,
      createdAt: true,
      _count: {
        select: {
          messages: true,
          memories: true,
          threads: true,
          discoveryAnswers: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get today's and month's usage per user
  const usageStats = await Promise.all(
    users.map(async (u) => {
      const [todayMessages, monthTokens, lastMessage] = await Promise.all([
        db.usageLog.count({
          where: { userId: u.id, action: 'chat', createdAt: { gte: todayStart } },
        }),
        db.usageLog.aggregate({
          where: { userId: u.id, createdAt: { gte: monthStart } },
          _sum: { tokens: true },
        }),
        db.message.findFirst({
          where: { userId: u.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ])

      return {
        ...u,
        todayMessages,
        monthTokens: monthTokens._sum.tokens || 0,
        lastActive: lastMessage?.createdAt || u.createdAt,
      }
    })
  )

  return NextResponse.json({ users: usageStats })
}
