import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET — return the user's active character (most recently updated)
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const character = await db.character.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { updatedAt: 'desc' },
  })

  if (!character) {
    return NextResponse.json({ character: null })
  }

  return NextResponse.json({
    character: {
      id: character.id,
      name: character.name,
      selections: character.selections,
      customizations: character.customizations,
      compiledPrompt: character.compiledPrompt,
      nicheType: character.nicheType,
      nicheAudience: character.nicheAudience,
      missionStatement: character.missionStatement,
      uniqueEdge: character.uniqueEdge,
      contentPillars: character.contentPillars,
      imageUrls: character.imageUrls,
      personality: character.personality,
      backstory: character.backstory,
      speakingStyle: character.speakingStyle,
      interests: character.interests,
      voiceStyle: character.voiceStyle,
    },
  })
}
