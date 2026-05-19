import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — upload profile images for a character
// Accepts base64 images and stores them
// TODO: When Supabase Storage is configured, upload to bucket
// For now, stores base64 URLs directly in the database
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { characterId, images } = body

  if (!characterId || !images || !Array.isArray(images)) {
    return NextResponse.json(
      { error: 'characterId and images array required' },
      { status: 400 }
    )
  }

  if (images.length > 4) {
    return NextResponse.json(
      { error: 'Maximum 4 profile images allowed' },
      { status: 400 }
    )
  }

  // Verify the character belongs to this user
  const character = await db.character.findFirst({
    where: { id: characterId, userId: user.id },
  })

  if (!character) {
    return NextResponse.json(
      { error: 'Character not found' },
      { status: 404 }
    )
  }

  // TODO: Upload to Supabase Storage and get public URLs
  // For now, we store image metadata (in production, these would be URLs)
  // Each image should be: { url: string, label?: string }
  //
  // When Supabase Storage is set up:
  // 1. Upload each image to supabase.storage.from('character-images').upload(...)
  // 2. Get public URL: supabase.storage.from('character-images').getPublicUrl(...)
  // 3. Store the public URLs in imageUrls

  const imageUrls = images.map((img: { url: string; label?: string }, index: number) => ({
    url: img.url,
    label: img.label || `Profile ${index + 1}`,
    uploadedAt: new Date().toISOString(),
  }))

  await db.character.update({
    where: { id: characterId },
    data: { imageUrls },
  })

  return NextResponse.json({
    success: true,
    characterId,
    imageCount: imageUrls.length,
  })
}

// GET — get character details including images
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const characterId = searchParams.get('id')

  if (characterId) {
    const character = await db.character.findFirst({
      where: { id: characterId, userId: user.id },
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }
    return NextResponse.json(character)
  }

  // Return all characters for this user
  const characters = await db.character.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ characters })
}
