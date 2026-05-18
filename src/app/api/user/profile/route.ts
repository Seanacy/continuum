import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — return current user profile
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      aiName: true,
      location: true,
      timezone: true,
    },
  })

  return NextResponse.json({ profile })
}

// PATCH — update profile fields (location, name, aiName)
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const allowedFields = ['name', 'aiName', 'location', 'timezone']
  const updates: Record<string, string> = {}

  for (const field of allowedFields) {
    if (typeof body[field] === 'string') {
      updates[field] = body[field].trim().slice(0, 100)
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: updates,
    select: {
      id: true,
      name: true,
      aiName: true,
      location: true,
      timezone: true,
    },
  })

  return NextResponse.json({ profile: updated })
}
