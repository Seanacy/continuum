import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// GET — retrieve current AI state
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const aiState = await db.aiState.findUnique({
    where: { userId: user.id },
  })

  if (!aiState) {
    return NextResponse.json({ error: 'AI state not found' }, { status: 404 })
  }

  return NextResponse.json({
    aiState: {
      tone: aiState.tone,
      energy: aiState.energy,
      traits: aiState.traits,
      lastActiveAt: aiState.lastActiveAt,
    },
  })
}

// PATCH — update AI state (used by background loops to evolve personality)
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { tone, energy, traits } = body

  const updateData: Record<string, unknown> = {}
  if (tone) updateData.tone = tone
  if (energy) updateData.energy = energy
  if (traits) updateData.traits = JSON.stringify(traits)

  const updated = await db.aiState.update({
    where: { userId: user.id },
    data: updateData,
  })

  return NextResponse.json({
    aiState: {
      tone: updated.tone,
      energy: updated.energy,
      traits: updated.traits,
    },
  })
}
