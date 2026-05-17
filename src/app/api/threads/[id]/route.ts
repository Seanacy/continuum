import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveThread, pauseThread, resumeThread } from '@/lib/thread-engine'

// GET — get single thread with messages
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const thread = await db.thread.findUnique({
    where: { id: params.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
  })

  if (!thread || thread.userId !== user.id) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  return NextResponse.json({ thread })
}

// PATCH — update thread status (resolve, pause, resume)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { action } = await req.json()

  let success = false
  switch (action) {
    case 'resolve':
      success = await resolveThread(params.id, user.id)
      break
    case 'pause':
      success = await pauseThread(params.id, user.id)
      break
    case 'resume':
      success = await resumeThread(params.id, user.id)
      break
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  if (!success) {
    return NextResponse.json({ error: 'Thread not found or not yours' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
