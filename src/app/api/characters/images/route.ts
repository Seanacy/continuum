import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
const VALID_SLOTS = ['front', 'left', 'right', 'body']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// POST — upload a reference image for a character slot
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const characterId = formData.get('characterId') as string | null
  const slot = formData.get('slot') as string | null

  if (!file || !characterId || !slot) {
    return NextResponse.json(
      { error: 'file, characterId, and slot are required' },
      { status: 400 }
    )
  }

  if (!VALID_SLOTS.includes(slot)) {
    return NextResponse.json(
      { error: `Invalid slot. Must be one of: ${VALID_SLOTS.join(', ')}` },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum 10MB.' },
      { status: 400 }
    )
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json(
      { error: 'File must be an image (PNG, JPG, WEBP)' },
      { status: 400 }
    )
  }

  // Verify the character belongs to this user
  const character = await db.character.findFirst({
    where: { id: characterId, userId: user.id },
  })

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'png'
  const storagePath = `ref-images/${character.id}/${slot}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    console.error('Supabase upload error:', uploadError)
    return NextResponse.json(
      { error: 'Failed to upload image. Please try again.' },
      { status: 500 }
    )
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl + '?t=' + Date.now()

  // Update character's customizations with the new ref image URL
  const currentCustomizations = (character.customizations as Record<string, any>) || {}
  const currentRefImages = currentCustomizations.refImages || {}
  const updatedRefImages = { ...currentRefImages, [slot]: publicUrl }

  const updatedCustomizations = {
    ...currentCustomizations,
    refImages: updatedRefImages,
  }

  await db.character.update({
    where: { id: character.id },
    data: {
      customizations: JSON.parse(JSON.stringify(updatedCustomizations)),
      // Also update imageUrls array for backward compat
      imageUrls: JSON.parse(JSON.stringify(Object.values(updatedRefImages))),
    },
  })

  return NextResponse.json({
    url: publicUrl,
    slot,
    characterId: character.id,
  })
}
