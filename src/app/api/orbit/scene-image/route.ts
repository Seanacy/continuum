import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
const MAX_SIZE = 10 * 1024 * 1024

async function ownsCharacter(characterId: string, userId: string) {
  return db.orbitCharacter.findFirst({
    where: { id: characterId, project: { userId } },
    select: { id: true },
  })
}

// GET /api/orbit/scene-image?characterId=... -- list a character's scene folder.
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const characterId = new URL(req.url).searchParams.get('characterId')
    if (!characterId) return NextResponse.json({ error: 'characterId required' }, { status: 400 })
    if (!(await ownsCharacter(characterId, user.id))) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const prefix = `orbit/${characterId}/scenes`
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) {
      console.error('scene list error', error)
      return NextResponse.json({ scenes: [] })
    }
    const scenes = (data || [])
      .filter((f) => f.name && !f.name.startsWith('.'))
      .map((f) => {
        const path = `${prefix}/${f.name}`
        return { path, url: '/api/img/' + path }
      })
    return NextResponse.json({ scenes })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

// POST /api/orbit/scene-image -- add a consented photo to a character's scene folder.
// Multipart form: file, characterId.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const characterId = formData.get('characterId') as string | null
    if (!file || !characterId) {
      return NextResponse.json({ error: 'file and characterId are required' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }
    if (!(await ownsCharacter(characterId, user.id))) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const storagePath = `orbit/${characterId}/scenes/${id}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })
    if (upErr) {
      console.error('scene upload error', upErr)
      return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 })
    }

    return NextResponse.json({ path: storagePath, url: '/api/img/' + storagePath })
  } catch (err: any) {
    console.error('POST /api/orbit/scene-image error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/orbit/scene-image -- remove a scene photo. Body: { characterId, path }
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { characterId, path } = await req.json()
    if (!characterId || !path) return NextResponse.json({ error: 'characterId and path required' }, { status: 400 })
    if (!(await ownsCharacter(characterId, user.id))) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }
    const clean = String(path).split('?')[0].replace('/api/img/', '')
    if (!clean.startsWith(`orbit/${characterId}/scenes/`)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    await supabase.storage.from(BUCKET).remove([clean])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
