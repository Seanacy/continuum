import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// ============================================
// DELETE CHARACTER
// ============================================

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { characterId } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
    }

    // Verify the character belongs to this user
    const character = await db.character.findUnique({
      where: { id: characterId },
    })

    if (!character || character.userId !== user.id) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Delete related records first (images, content, etc.)
    await db.characterImage.deleteMany({ where: { characterId } })

    // Delete the character
    await db.character.delete({ where: { id: characterId } })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Delete character error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to delete character' },
      { status: 500 }
    )
  }
}
