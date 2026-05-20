import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
const VALID_TYPES = ['head_front', 'head_left', 'head_right', 'body_front', 'body_left', 'body_right']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// POST — upload a generated image for a specific image type
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const characterId = formData.get('characterId') as string | null
    const imageType = formData.get('imageType') as string | null

    if (!file || !characterId || !imageType) {
      return NextResponse.json(
        { error: 'file, characterId, and imageType are required' },
        { status: 400 }
      )
    }

    if (!VALID_TYPES.includes(imageType)) {
      return NextResponse.json(
        { error: `Invalid imageType. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image (PNG, JPG, WEBP)' }, { status: 400 })
    }

    // Verify ownership
    const character = await db.character.findFirst({
      where: { id: characterId, userId: user.id },
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'png'
    const storagePath = `generated/${character.id}/${imageType}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl + '?t=' + Date.now()

    // Position mapping
    const positionMap: Record<string, number> = {
      head_front: 0, head_left: 1, head_right: 2,
      body_front: 3, body_left: 4, body_right: 5,
    }

    // Upsert the CharacterImage record
    await db.characterImage.upsert({
      where: {
        characterId_imageType: {
          characterId: character.id,
          imageType: imageType,
        },
      },
      create: {
        characterId: character.id,
        imageType: imageType,
        imageUrl: publicUrl,
        position: positionMap[imageType] ?? 0,
      },
      update: {
        imageUrl: publicUrl,
        position: positionMap[imageType] ?? 0,
      },
    })

    // Also update the character's imageUrls array for backward compat
    const allImages = await db.characterImage.findMany({
      where: { characterId: character.id },
      orderBy: { position: 'asc' },
    })

    await db.character.update({
      where: { id: character.id },
      data: {
        imageUrls: JSON.parse(JSON.stringify(allImages.map(i => i.imageUrl))),
      },
    })

    return NextResponse.json({
      url: publicUrl,
      imageType,
      characterId: character.id,
      totalImages: allImages.length,
    })
  } catch (err: any) {
    console.error('POST /api/characters/visual-images error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
