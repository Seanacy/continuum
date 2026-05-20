import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Shape a character row into the API response format
function formatCharacter(c: any) {
  return {
    id: c.id,
    name: c.name,
    selections: c.selections,
    customizations: c.customizations,
    compiledPrompt: c.compiledPrompt,
    nicheType: c.nicheType,
    nicheAudience: c.nicheAudience,
    missionStatement: c.missionStatement,
    uniqueEdge: c.uniqueEdge,
    contentPillars: c.contentPillars,
    imageUrls: c.imageUrls,
    personality: c.personality,
    backstory: c.backstory,
    speakingStyle: c.speakingStyle,
    interests: c.interests,
    voiceStyle: c.voiceStyle,
  }
}

// GET — return ALL of the user's active characters (newest first)
// Also returns `character` (the first one) for backward compatibility
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const characters = await db.character.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (characters.length === 0) {
      return NextResponse.json({ character: null, characters: [] })
    }

    return NextResponse.json({
      character: formatCharacter(characters[0]),        // backward compat
      characters: characters.map(formatCharacter),      // full list
    })
  } catch (err: any) {
    console.error('GET /api/characters/mine error:', err?.message, err?.code, err?.meta)
    return NextResponse.json(
      { error: err?.message || 'Internal error', code: err?.code, meta: err?.meta },
      { status: 500 }
    )
  }
}
