import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — retrieve user's feed items (paginated)
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const cursor = searchParams.get('cursor')
  const unseenOnly = searchParams.get('unseen') === 'true'

  const feedItems = await db.feedItem.findMany({
    where: {
      userId: user.id,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      ...(unseenOnly ? { seen: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Count unseen
  const unseenCount = await db.feedItem.count({
    where: { userId: user.id, seen: false },
  })

  return NextResponse.json({ feedItems, unseenCount })
}

// PATCH — mark feed items as seen
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { ids } = await req.json()

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  }

  await db.feedItem.updateMany({
    where: {
      id: { in: ids },
      userId: user.id,
    },
    data: { seen: true },
  })

  // Log the interaction
  await db.interaction.create({
    data: {
      userId: user.id,
      type: 'feed_view',
      metadata: JSON.stringify({ itemCount: ids.length }),
    },
  })

  return NextResponse.json({ success: true })
}
