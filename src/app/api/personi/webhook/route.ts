import { NextRequest, NextResponse } from 'next/server'
import { verifyPersoniToken, syncCharacterFromPersoni } from '@/lib/personi-integration'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — Personi sends webhook when a character is updated
// Continuum re-syncs the character data
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, personiCharId, event } = body

  // Verify the webhook is actually from Personi
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  const verification = verifyPersoniToken(token)
  if (!verification.valid) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Find which Continuum user owns this character
  const character = await db.character.findFirst({
    where: { personiId: personiCharId },
    select: { userId: true },
  })

  if (!character) {
    // Character not synced to Continuum — ignore
    return NextResponse.json({ ok: true, skipped: true })
  }

  switch (event) {
    case 'character.updated':
      await syncCharacterFromPersoni(character.userId, personiCharId)
      break

    case 'character.deleted':
      await db.character.updateMany({
        where: { personiId: personiCharId },
        data: { isActive: false },
      })
      break

    default:
      console.log(`[Personi Webhook] Unknown event: ${event}`)
  }

  return NextResponse.json({ ok: true, event })
}
