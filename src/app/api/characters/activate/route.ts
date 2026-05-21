import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { characterId } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
    }

    // Verify character belongs to user
    const character = await db.character.findFirst({
      where: { id: characterId, userId: user.id }
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Deactivate all user's characters
    await db.character.updateMany({
      where: { userId: user.id },
      data: { isActive: false }
    })

    // Activate the selected character
    const updated = await db.character.update({
      where: { id: characterId },
      data: { isActive: true }
    })

    return NextResponse.json({ character: updated })
  } catch (error) {
    console.error('Error activating character:', error)
    return NextResponse.json({ error: 'Failed to activate character' }, { status: 500 })
  }
}
