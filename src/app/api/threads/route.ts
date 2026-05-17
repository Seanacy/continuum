import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { createThread } from '@/lib/thread-engine'

// GET — list user's threads
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // "active" | "paused" | "resolved" | null

  const threads = await db.thread.findMany({
    where: {
      userId: user.id,
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { messages: true } },
    },
  })

  return NextResponse.json({ threads })
}

// POST — create a new thread manually
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { title, summary } = await req.json()

  if (!title || typeof title !== 'string' || title.length < 1) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const threadId = await createThread(user.id, title, summary)

  return NextResponse.json({ threadId }, { status: 201 })
}
