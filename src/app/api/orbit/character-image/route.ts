import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { ORBIT_IMAGE_SLOT_KEYS } from '@/lib/orbit-image-slots'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// POST — upload one labeled profile image for an Orbit character.
// Works from the PWA: the client sends a multipart form with file, characterId, slot.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const characterId = formData.get('characterId') as string | null
    const slot = formData.get('slot') as string | null

    if (!file || !characterId || !slot) {
      return NextResponse.json({ error: 'file, characterId, and slot are required' }, { status: 400 })
    }
    if (!ORBIT_IMAGE_SLOT_KEYS.includes(slot)) {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Verify the Orbit character belongs to one of this user's projects
    const character = await db.orbitCharacter.findFirst({
      where: { id: characterId, project: { userId: user.id } },
      select: { id: true, profileImages: true },
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const ext = file.name.split('.').pop() || 'png'
    const storagePath = `orbit/${characterId}/${slot}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 })
    }

    const url = '/api/img/' + storagePath + '?t=' + Date.now()

    const current =
      character.profileImages &&
      typeof character.profileImages === 'object' &&
      !Array.isArray(character.profileImages)
        ? (character.profileImages as Record<string, string>)
        : {}
    const updated = { ...current, [slot]: url }

    await db.orbitCharacter.update({
      where: { id: characterId },
      data: { profileImages: JSON.parse(JSON.stringify(updated)) },
    })

    return NextResponse.json({ url, slot, characterId })
  } catch (err: any) {
    console.error('POST /api/orbit/character-image error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
