import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'character-images'

function storagePathFromProxy(v: string): string | null {
  if (!v || typeof v !== 'string') return null
  const i = v.indexOf('/api/img/')
  if (i === -1) return v.split('?')[0] // already a bare storage path
  return v.slice(i + '/api/img/'.length).split('?')[0]
}

async function signed(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

// POST -- recreate a post image by swapping the character's face onto a base photo.
// Body: { projectId, postId, baseImagePath }  (baseImagePath = a storage path the
// user owns/has permission to use, e.g. orbit/<charId>/scenes/<id>.jpg).
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const apiKey = process.env.FAL_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Image generation not configured (FAL_API_KEY missing)' }, { status: 500 })

    const { projectId, postId, baseImagePath } = await req.json()
    if (!projectId || !postId || !baseImagePath) {
      return NextResponse.json({ error: 'projectId, postId, and baseImagePath are required' }, { status: 400 })
    }

    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true, strategyTable: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const strategyTable: any = project.strategyTable || {}
    const posts: any[] = Array.isArray(strategyTable?.generatedContent) ? strategyTable.generatedContent : []
    const post = posts.find((p) => p && p.id === postId)
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const characterId: string = post.characterId
    const character = await db.orbitCharacter.findFirst({
      where: { id: characterId, project: { userId: user.id } },
      select: { id: true, profileImages: true },
    })
    if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })

    // Face source = the character's front face reference.
    const pi: any = character.profileImages || {}
    const faceRaw: string | undefined =
      pi.face_front || pi.face_left || pi.face_right ||
      (typeof pi === 'object' ? Object.values(pi)[0] : undefined)
    const facePath = faceRaw ? storagePathFromProxy(faceRaw as string) : null
    if (!facePath) return NextResponse.json({ error: 'This character has no face reference photo.' }, { status: 400 })

    // Base image = the consented photo the user picked. Must belong to this user.
    const basePath = storagePathFromProxy(String(baseImagePath))
    if (!basePath || !basePath.startsWith(`orbit/${characterId}/`)) {
      return NextResponse.json({ error: 'Base photo is not valid for this character.' }, { status: 400 })
    }

    const faceUrl = await signed(facePath)
    const baseUrl = await signed(basePath)
    if (!faceUrl || !baseUrl) return NextResponse.json({ error: 'Could not read the source photos.' }, { status: 500 })

    // fal face-swap: put the character's face (swap) onto the base photo.
    const falRes = await fetch('https://fal.run/fal-ai/face-swap', {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_image_url: baseUrl, swap_image_url: faceUrl }),
    })
    if (!falRes.ok) {
      const t = await falRes.text()
      console.error('fal face-swap error', falRes.status, t)
      return NextResponse.json({ error: 'Face swap failed at fal (' + falRes.status + ').', detail: t.slice(0, 300) }, { status: 502 })
    }
    const falData = await falRes.json()
    const outUrl: string | undefined = falData?.image?.url || falData?.images?.[0]?.url
    if (!outUrl) return NextResponse.json({ error: 'No image was returned.', got: JSON.stringify(falData).slice(0, 300) }, { status: 502 })

    let buffer: Buffer
    if (outUrl.startsWith('data:')) {
      buffer = Buffer.from(outUrl.split(',')[1], 'base64')
    } else {
      const imgRes = await fetch(outUrl)
      buffer = Buffer.from(await imgRes.arrayBuffer())
    }

    const storagePath = `orbit/${characterId}/posts/${postId}.jpg`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })
    if (upErr) {
      console.error('upload error', upErr)
      return NextResponse.json({ error: 'Could not save the image.' }, { status: 500 })
    }

    const proxyUrl = '/api/img/' + storagePath + '?t=' + Date.now()
    const updated = posts.map((p) => (p && p.id === postId ? { ...p, imageUrl: proxyUrl } : p))
    await db.orbitProject.update({
      where: { id: projectId },
      data: { strategyTable: { ...strategyTable, generatedContent: updated } as any },
    })

    return NextResponse.json({ url: proxyUrl, postId })
  } catch (err: any) {
    console.error('POST /api/orbit/recreate-post-image error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
