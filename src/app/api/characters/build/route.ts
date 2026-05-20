import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — create or update a character with bundle selections
export async function POST(req: NextRequest) {
  try {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const {
    characterId,
    name,
    selections,
    customizations,
    nicheType,
    nicheAudience,
    missionStatement,
    uniqueEdge,
    contentPillars,
    visualTraits,
  } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Character name is required' }, { status: 400 })
  }

  // Build a personality blob from selections for backward compat
  const personality: Record<string, string> = {}
  if (selections && typeof selections === 'object') {
    for (const [cat, bundleId] of Object.entries(selections)) {
      const customKey = `${cat}_custom`
      const customText = customizations?.[customKey]
      personality[cat] = (customText as string) || (bundleId as string)
    }
  }

  const data = {
    name: name.trim(),
    selections: JSON.parse(JSON.stringify(selections || {})),
    customizations: JSON.parse(JSON.stringify(customizations || {})),
    personality: JSON.parse(JSON.stringify(personality)),
    nicheType: nicheType || null,
    nicheAudience: nicheAudience || null,
    missionStatement: missionStatement || null,
    uniqueEdge: uniqueEdge || null,
    contentPillars: JSON.parse(JSON.stringify(contentPillars || [])),
    visualTraits: JSON.parse(JSON.stringify(visualTraits || {})),
    isActive: true,
  }

  let character

  if (characterId) {
    // Update existing — verify ownership
    const existing = await db.character.findFirst({
      where: { id: characterId, userId: user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    character = await db.character.update({
      where: { id: characterId },
      data,
    })
  } else {
    // Create new — enforce 5-character limit
    const activeCount = await db.character.count({
      where: { userId: user.id, isActive: true },
    })
    if (activeCount >= 5) {
      return NextResponse.json(
        { error: 'You can have up to 5 characters. Deactivate one to create a new one.' },
        { status: 403 }
      )
    }

    character = await db.character.create({
      data: {
        ...data,
        userId: user.id,
      },
    })
  }

  return NextResponse.json({
    character: {
      id: character.id,
      name: character.name,
      selections: character.selections,
      customizations: character.customizations,
      nicheType: character.nicheType,
      nicheAudience: character.nicheAudience,
      missionStatement: character.missionStatement,
      uniqueEdge: character.uniqueEdge,
      contentPillars: character.contentPillars,
    },
  })
  } catch (err: any) {
    console.error('POST /api/characters/build error:', err?.message, err?.code, err?.meta)
    return NextResponse.json(
      { error: err?.message || 'Internal error', code: err?.code, meta: err?.meta },
      { status: 500 }
    )
  }
}
