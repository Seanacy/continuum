import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'character-images'

const REALISM =
  'candid iPhone snapshot, natural lighting, real lifelike skin with visible pores and texture, ' +
  'amateur photo, slightly imperfect framing, attractive woman in her 20s, not studio, not glossy, not an advertisement'

const NEGATIVE =
  'text, words, watermark, logo, signature, extra limbs, extra fingers, bad anatomy, deformed, ' +
  'cartoon, anime, 3d render, cgi, plastic skin, airbrushed, blurry, low quality'

function storagePathFromProxy(v: string): string | null {
  if (!v || typeof v !== 'string') return null
  const i = v.indexOf('/api/img/')
  if (i === -1) return v.split('?')[0]
  return v.slice(i + '/api/img/'.length).split('?')[0]
}

async function signed(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

// Ask a vision model to describe ONLY the pose/scene of the inspiration photo
// (not the person's identity) so we can recreate that vibe with our own character.
async function describeInspiration(apiKey: string, imageUrl: string): Promise<string> {
  const prompt =
    'Describe ONLY the body pose, camera angle, framing, location and setting, background, lighting, ' +
    "time of day, and clothing/outfit in this photo. Do NOT describe the person's face, hair, skin tone, " +
    'age, or identity. Answer in one vivid sentence.'
  try {
    const res = await fetch('https://fal.run/fal-ai/moondream-next', {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, prompt }),
    })
    if (res.ok) {
      const j: any = await res.json()
      const out = j?.output ?? j?.caption ?? j?.results ?? j?.text ?? ''
      if (typeof out === 'string' && out.trim()) return out.trim()
    } else {
      console.error('moondream error', res.status, (await res.text()).slice(0, 200))
    }
  } catch (e: any) {
    console.error('moondream exception', e?.message)
  }
  // Fallback: Florence-2 detailed caption (no custom prompt, describes the whole scene).
  try {
    const res = await fetch('https://fal.run/fal-ai/florence-2-large/detailed-caption', {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    })
    if (res.ok) {
      const j: any = await res.json()
      const out = j?.results ?? j?.caption ?? j?.output ?? ''
      if (typeof out === 'string' && out.trim()) return out.trim()
    }
  } catch {
    /* ignore */
  }
  return ''
}

// POST -- recreate a post image: copy the vibe of the inspiration photo and
// generate a brand-new photo with THIS character in it (her own face, hair, skin).
// Body: { projectId, postId, baseImagePath }  (baseImagePath = an inspiration photo
// the user owns/has permission to use, e.g. orbit/<charId>/scenes/<id>.jpg).
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
      select: { id: true, name: true, imagePrompt: true, profileImages: true },
    })
    if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })

    // Face/identity source = the character's front face reference.
    const pi: any = character.profileImages || {}
    const faceRaw: string | undefined =
      pi.face_front || pi.face_left || pi.face_right ||
      (typeof pi === 'object' ? Object.values(pi)[0] : undefined)
    const facePath = faceRaw ? storagePathFromProxy(faceRaw as string) : null
    if (!facePath) return NextResponse.json({ error: 'This character has no face reference photo.' }, { status: 400 })

    // Inspiration photo = the photo the user picked. Must belong to this character.
    const basePath = storagePathFromProxy(String(baseImagePath))
    if (!basePath || !basePath.startsWith(`orbit/${characterId}/`)) {
      return NextResponse.json({ error: 'Inspiration photo is not valid for this character.' }, { status: 400 })
    }

    const faceUrl = await signed(facePath)
    const baseUrl = await signed(basePath)
    if (!faceUrl || !baseUrl) return NextResponse.json({ error: 'Could not read the source photos.' }, { status: 500 })

    // 1) Read the pose/setting/outfit from the inspiration photo.
    const sceneDesc = await describeInspiration(apiKey, baseUrl)
    const look = (character.imagePrompt && String(character.imagePrompt).slice(0, 300)) || character.name
    const scene = sceneDesc || 'a candid everyday phone photo, relaxed pose'
    // Her identity, hair and skin come first; the inspiration photo only sets the scene.
    const prompt = `${character.name}, ${look}. Recreate this exact scene with her: ${scene}. ${REALISM}.`

    // 2) Generate a fresh photo of HER (face from PuLID identity, hair + skin from her
    //    description) in the inspiration photo's vibe.
    const falRes = await fetch('https://fal.run/fal-ai/flux-pulid', {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        reference_image_url: faceUrl,
        image_size: 'portrait_4_3',
        num_inference_steps: 20,
        guidance_scale: 4,
        id_weight: 1,
        negative_prompt: NEGATIVE,
        enable_safety_checker: true,
      }),
    })
    if (!falRes.ok) {
      const t = await falRes.text()
      console.error('fal pulid error', falRes.status, t)
      return NextResponse.json({ error: 'Image generation failed at fal (' + falRes.status + ').', detail: t.slice(0, 300) }, { status: 502 })
    }
    const falData = await falRes.json()
    const outUrl: string | undefined = falData?.images?.[0]?.url || falData?.image?.url
    if (!outUrl) return NextResponse.json({ error: 'No image was returned.' }, { status: 502 })

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
