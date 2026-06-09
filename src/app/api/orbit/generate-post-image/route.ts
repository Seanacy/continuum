import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'character-images'

// Candid scenes rotated by weekday so the week has variety.
const SCENES = [
  'taking a selfie in the front seat of a car, seatbelt on, bright daylight, parking lot out the window',
  'bathroom mirror selfie getting ready to go out, phone half over her face, products on the counter',
  'candid photo at a cozy cafe holding a coffee, sitting by a window in warm light',
  'on a trendy rooftop at golden hour, city skyline behind her, relaxed',
  'relaxing at home on the couch by a window in soft natural light, cozy outfit',
  'out at night in line at a bar, neon signs behind her, harsh phone flash',
  'walking outside on a sunny street, mid-stride glancing at the camera, casual',
]
const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

const REALISM =
  'candid iPhone snapshot, natural lighting, real lifelike skin with visible pores and texture, ' +
  'amateur photo, slightly imperfect framing, attractive woman in her 20s, not studio, not glossy, not an advertisement'

const NEGATIVE =
  'text, words, watermark, logo, signature, extra limbs, extra fingers, bad anatomy, deformed, ' +
  'cartoon, anime, 3d render, cgi, plastic skin, airbrushed, blurry, low quality'

function storagePathFromProxy(v: string): string | null {
  if (!v || typeof v !== 'string') return null
  const i = v.indexOf('/api/img/')
  if (i === -1) return null
  return v.slice(i + '/api/img/'.length).split('?')[0]
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const apiKey = process.env.FAL_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Image generation not configured (FAL_API_KEY missing)' }, { status: 500 })

    const { projectId, postId } = await req.json()
    if (!projectId || !postId) {
      return NextResponse.json({ error: 'projectId and postId are required' }, { status: 400 })
    }

    // Load the project + its posts, verify ownership.
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

    // Find a face reference image for this character.
    const pi: any = character.profileImages || {}
    const refRaw: string | undefined =
      pi.face_front || pi.face_left || pi.face_right || pi.body_front ||
      (typeof pi === 'object' ? Object.values(pi)[0] : undefined)
    const refPath = refRaw ? storagePathFromProxy(refRaw as string) : null
    if (!refPath) {
      return NextResponse.json({ error: 'This character has no reference photo to match a face from.' }, { status: 400 })
    }

    // Temporary public URL so fal can fetch the reference photo.
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(refPath, 3600)
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({ error: 'Could not read the reference photo.' }, { status: 500 })
    }

    // Build the scene prompt.
    const sceneIdx = DAY_INDEX[post.dayLabel] ?? 0
    const scene = SCENES[sceneIdx]
    const baseLook = (character.imagePrompt && String(character.imagePrompt).slice(0, 300)) || character.name
    const prompt = `${baseLook}. ${scene}. ${REALISM}.`

    // Call fal PuLID (face from reference, scene from prompt).
    const falRes = await fetch('https://fal.run/fal-ai/flux-pulid', {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        reference_image_url: signed.signedUrl,
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
      return NextResponse.json({ error: 'Image generation failed at fal (' + falRes.status + ').' }, { status: 502 })
    }
    const falData = await falRes.json()
    const outUrl: string | undefined = falData?.images?.[0]?.url
    if (!outUrl) return NextResponse.json({ error: 'No image was returned.' }, { status: 502 })

    // Get the generated image bytes (hosted URL or data URI).
    let buffer: Buffer
    if (outUrl.startsWith('data:')) {
      const b64 = outUrl.split(',')[1]
      buffer = Buffer.from(b64, 'base64')
    } else {
      const imgRes = await fetch(outUrl)
      buffer = Buffer.from(await imgRes.arrayBuffer())
    }

    // Save into the character's private post folder.
    const storagePath = `orbit/${characterId}/posts/${postId}.jpg`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })
    if (upErr) {
      console.error('upload error', upErr)
      return NextResponse.json({ error: 'Could not save the generated image.' }, { status: 500 })
    }

    const proxyUrl = '/api/img/' + storagePath + '?t=' + Date.now()
    const updated = posts.map((p) => (p && p.id === postId ? { ...p, imageUrl: proxyUrl } : p))
    await db.orbitProject.update({
      where: { id: projectId },
      data: { strategyTable: { ...strategyTable, generatedContent: updated } as any },
    })

    return NextResponse.json({ url: proxyUrl, postId })
  } catch (err: any) {
    console.error('POST /api/orbit/generate-post-image error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
