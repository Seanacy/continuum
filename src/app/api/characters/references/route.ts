import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// POST — upload a reference photo (used for Google Image search approval flow)
// These are temporary reference images the AI agent found, not the final generated images
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const characterId = formData.get('characterId') as string | null
    const refType = formData.get('refType') as string | null // 'face' or 'body'

    if (!file || !characterId) {
      return NextResponse.json(
        { error: 'file and characterId are required' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Verify ownership
    const character = await db.character.findFirst({
      where: { id: characterId, userId: user.id },
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Upload to Supabase Storage under references/
    const ext = file.name.split('.').pop() || 'png'
    const timestamp = Date.now()
    const storagePath = `references/${character.id}/${refType || 'general'}_${timestamp}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload reference.' }, { status: 500 })
    }

    const publicUrl = '/api/img/' + storagePath + '?t=' + timestamp

    return NextResponse.json({
      url: publicUrl,
      refType: refType || 'general',
      characterId: character.id,
    })
  } catch (err: any) {
    console.error('POST /api/characters/references error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
