import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — save a push subscription
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { endpoint, keys } = body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Upsert — if they already have this endpoint, update it
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  })

  return NextResponse.json({ success: true })
}

// DELETE — remove a push subscription
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { endpoint } = body

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  await db.pushSubscription.deleteMany({
    where: { userId: user.id, endpoint },
  })

  return NextResponse.json({ success: true })
}

// GET — return the VAPID public key so the client can subscribe
export async function GET() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  }

  return NextResponse.json({ vapidPublicKey })
}
