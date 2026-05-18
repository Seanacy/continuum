import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// POST — batch-insert interactions from the client tracker
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { interactions } = body

  if (!Array.isArray(interactions) || interactions.length === 0) {
    return NextResponse.json({ error: 'No interactions provided' }, { status: 400 })
  }

  // Cap at 50 per batch to prevent abuse
  const batch = interactions.slice(0, 50)

  await db.interaction.createMany({
    data: batch.map((i: { type: string; metadata?: Record<string, unknown> }) => ({
      userId: session.userId,
      type: i.type,
      metadata: (i.metadata || {}) as Prisma.InputJsonValue,
    })),
  })

  return NextResponse.json({ logged: batch.length })
}

// GET — return recent interactions (for debugging / analytics)
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const interactions = await db.interaction.findMany({
    where: {
      userId: session.userId,
      createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ interactions })
}
