// Video Generation Pipeline — Powered by Higgsfield + ElevenLabs
// Takes a character + user preferences and produces a finished video
//
// Pipeline stages:
// 1. SCRIPTING — LLM generates a video script (scene-by-scene)
// 2. GENERATING — Higgsfield API generates each scene as a clip (Kling 3.0)
// 3. NARRATION — ElevenLabs generates voiceover from script narration
// 4. STITCHING — Shotstack API combines clips + audio into final MP4
// 5. READY — Final video available for download
//
// Env vars needed:
// - HIGGSFIELD_API_KEY: API key from cloud.higgsfield.ai/dashboard
// - ELEVENLABS_API_KEY: API key from elevenlabs.io
// - ELEVENLABS_VOICE_ID: default voice ID (optional, falls back to 'Rachel')
// - SHOTSTACK_API_KEY: API key from dashboard.shotstack.io
// - SHOTSTACK_ENV: set to 'production' for live renders (default: sandbox/watermarked)
//
// All stages gracefully fall back to stubs when API keys are missing.
//
// Cost tracking: every API call logs its cost so we know actual margins

import { db } from './db'
import { callLLM } from './llm'
import { buildUnifiedContext } from './continuity-orchestrator'
import { spendVideoCredit } from './credit-system'
import type { VideoScript, VideoScene } from './script-engine'

// ============================================
// ENV
// ============================================
const HIGGSFIELD_API_KEY = process.env.HIGGSFIELD_API_KEY || ''
const HIGGSFIELD_API_URL = 'https://api.higgsfield.ai/v1'
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || 'Rachel'
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || ''
const SHOTSTACK_API_URL = process.env.SHOTSTACK_ENV === 'production'
  ? 'https://api.shotstack.io/v1'
  : 'https://api.shotstack.io/stage'  // free sandbox for testing (watermarked)

// ============================================
// COST CONSTANTS (real costs based on Higgsfield Kling 3.0 + ElevenLabs)
// ============================================
const COSTS = {
  SCRIPT_GENERATION: 0.03,     // LLM call for script
  SCENE_GENERATION: 0.29,      // per scene — Kling 3.0 via Higgsfield (~6 credits on Plus)
  NARRATION_TTS: 0.04,         // ElevenLabs TTS per video
  STITCHING: 0.05,             // Shotstack API (~$0.20/min, our videos are ~15s avg)
} as const

// ============================================
// START VIDEO JOB — the main entry point
// ============================================
export async function startVideoGeneration(
  userId: string,
  characterId: string,
  prompt?: string  // optional user guidance for the video
): Promise<{ success: boolean; jobId?: string; error?: string }> {

  // 1. Check and spend video credit
  const creditResult = await spendVideoCredit(userId)
  if (!creditResult.allowed) {
    return { success: false, error: 'No video credits available. Purchase credits to generate videos.' }
  }

  // 2. Verify character exists and belongs to user, include profile images
  const character = await db.character.findFirst({
    where: { id: characterId, userId, isActive: true },
    include: {
      characterImages: true,  // pull all 6 profile pics from CharacterImage table
    },
  })
  if (!character) {
    return { success: false, error: 'Character not found' }
  }

  // 3. Create the video job record
  const job = await db.videoJob.create({
    data: {
      userId,
      characterId,
      status: 'pending',
      script: {},
      scenes: [],
    },
  })

  // 4. Run the pipeline (fire-and-forget — updates job status as it progresses)
  runPipeline(job.id, userId, character, prompt).catch((err) => {
    console.error(`[Video] Pipeline failed for job ${job.id}:`, err)
    db.videoJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: err.message },
    }).catch(console.error)
  })

  return { success: true, jobId: job.id }
}

// ============================================
// RUN PIPELINE — executes all stages sequentially
// ============================================
async function runPipeline(
  jobId: string,
  userId: string,
  character: {
    id: string;
    name: string;
    personality: unknown;
    imageUrls: unknown;
    voiceStyle: string | null;
    characterImages: Array<{ imageType: string; imageUrl: string }>;
  },
  prompt?: string
): Promise<void> {
  let totalCost = 0

  // ---- STAGE 1: SCRIPTING ----
  await db.videoJob.update({ where: { id: jobId }, data: { status: 'scripting' } })

  const script = await generateScript(userId, character, prompt)
  totalCost += COSTS.SCRIPT_GENERATION

  await db.videoJob.update({
    where: { id: jobId },
    data: { script: JSON.parse(JSON.stringify(script)), duration: script.totalDuration, totalCost },
  })

  // ---- STAGE 2: GENERATING SCENES ----
  await db.videoJob.update({ where: { id: jobId }, data: { status: 'generating' } })

  const sceneResults = []
  for (const scene of script.scenes) {
    const result = await generateSceneVideo(scene, character)
    totalCost += COSTS.SCENE_GENERATION
    sceneResults.push(result)
  }

  await db.videoJob.update({
    where: { id: jobId },
    data: { scenes: JSON.parse(JSON.stringify(sceneResults)), totalCost },
  })

  // ---- STAGE 3: NARRATION ----
  const narrationUrl = await generateNarration(script.narrationFull, character.voiceStyle)
  totalCost += COSTS.NARRATION_TTS

  await db.videoJob.update({
    where: { id: jobId },
    data: { narrationUrl, totalCost },
  })

  // ---- STAGE 4: STITCHING ----
  await db.videoJob.update({ where: { id: jobId }, data: { status: 'stitching' } })

  const finalVideoUrl = await stitchVideo(sceneResults, narrationUrl, script)
  totalCost += COSTS.STITCHING

  // ---- DONE ----
  await db.videoJob.update({
    where: { id: jobId },
    data: {
      status: 'ready',
      finalVideoUrl,
      totalCost,
    },
  })

  console.log(`[Video] Job ${jobId} complete. Total cost: $${totalCost.toFixed(2)}`)
}

// ============================================
// STAGE 1: SCRIPT GENERATION
// Uses the same approach as script-engine but takes character personality
// ============================================
async function generateScript(
  userId: string,
  character: { name: string; personality: unknown },
  prompt?: string
): Promise<VideoScript> {
  const ctx = await buildUnifiedContext(userId)

  const userGuidance = prompt
    ? `\n\nThe user specifically requested: "${prompt}"`
    : '\n\nThe user didn\'t specify a topic — surprise them with something good.'

  const result = await callLLM(
    `You are creating a short video script (10-20 seconds) featuring the character "${character.name}".

CHARACTER PERSONALITY:
${JSON.stringify(character.personality, null, 2)}

ABOUT THE USER (who this video is for):
${ctx.fullContextBlock}
${userGuidance}

Write a JSON object:
{
  "title": "short catchy title (3-6 words)",
  "mood": "one word (reflective/uplifting/playful/cinematic/warm/intense/dreamy)",
  "style": "visual style (montage/single-shot/timelapse/abstract/documentary/cinematic)",
  "totalDuration": number between 10-20,
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": seconds,
      "visualPrompt": "detailed visual description for video AI — camera angle, lighting, colors, movement, character appearance and action",
      "narration": "voiceover text (1-2 sentences)"
    }
  ],
  "narrationFull": "all narration as one flowing piece",
  "reason": "why this video was made for this person"
}

Rules:
- 2-4 scenes, durations must sum to totalDuration
- The character "${character.name}" should appear in at least one scene
- Visual prompts must describe the character's appearance consistently
- Narration should sound like ${character.name}'s voice/personality
- Output ONLY valid JSON`,
    [{ role: 'user', content: 'Generate a personalized video script.' }],
    { maxTokens: 800, temperature: 0.85 }
  )

  const cleaned = result.content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as VideoScript
}

// ============================================
// STAGE 2: SCENE VIDEO GENERATION — Higgsfield API (Kling 3.0)
// ============================================
interface SceneResult {
  sceneNumber: number
  videoUrl: string
  characterRefUrl: string | null
  status: 'ready' | 'failed'
  cost: number
}

// Pick the best reference image for a scene based on the visual prompt
// Face close-ups → head_front, full body scenes → body_front, default → head_front
function pickBestRefImage(
  visualPrompt: string,
  characterImages: Array<{ imageType: string; imageUrl: string }>
): string | null {
  if (!characterImages || characterImages.length === 0) return null

  const prompt = visualPrompt.toLowerCase()
  const imageMap = new Map(characterImages.map(img => [img.imageType, img.imageUrl]))

  // Check if scene describes full body / standing / walking
  const isBodyScene = /\b(full body|standing|walking|running|sitting|full.?length|head to (toe|feet))\b/.test(prompt)
  // Check if scene describes face / close-up / headshot
  const isFaceScene = /\b(close.?up|headshot|face|portrait|looking at camera|expression)\b/.test(prompt)
  // Check for left/right angles
  const isLeftAngle = /\b(left side|left profile|from the left|facing left)\b/.test(prompt)
  const isRightAngle = /\b(right side|right profile|from the right|facing right)\b/.test(prompt)

  // Smart selection: match scene type to best image
  if (isBodyScene) {
    if (isLeftAngle && imageMap.has('body_left')) return imageMap.get('body_left')!
    if (isRightAngle && imageMap.has('body_right')) return imageMap.get('body_right')!
    if (imageMap.has('body_front')) return imageMap.get('body_front')!
  }
  if (isFaceScene) {
    if (isLeftAngle && imageMap.has('head_left')) return imageMap.get('head_left')!
    if (isRightAngle && imageMap.has('head_right')) return imageMap.get('head_right')!
    if (imageMap.has('head_front')) return imageMap.get('head_front')!
  }

  // Default fallback: head_front is the most recognizable reference
  return imageMap.get('head_front') || characterImages[0].imageUrl
}

async function generateSceneVideo(
  scene: VideoScene,
  character: { characterImages: Array<{ imageType: string; imageUrl: string }> }
): Promise<SceneResult> {
  // Smart pick: choose the best profile image for this scene's visual prompt
  const refUrl = pickBestRefImage(scene.visualPrompt, character.characterImages)

  // If no API key, fall back to stub mode
  if (!HIGGSFIELD_API_KEY) {
    console.log(`[Video] NO API KEY — stub mode for scene ${scene.sceneNumber}`)
    return {
      sceneNumber: scene.sceneNumber,
      videoUrl: `https://placeholder.continuum.app/scenes/scene_${scene.sceneNumber}_${Date.now()}.mp4`,
      characterRefUrl: refUrl,
      status: 'ready',
      cost: COSTS.SCENE_GENERATION,
    }
  }

  try {
    // Build the generation request
    const payload: Record<string, unknown> = {
      task: 'image-to-video',
      model: 'kling-3.0',
      prompt: scene.visualPrompt,
      duration: Math.min(scene.duration, 5), // Kling 3.0 supports up to 5s per clip
      fps: 30,
      motion_intensity: 'medium',
    }

    // If we have a character reference image, use image-to-video
    // Otherwise fall back to text-to-video
    if (refUrl) {
      payload.input_image = refUrl
    } else {
      payload.task = 'text-to-video'
    }

    console.log(`[Video] Higgsfield: Generating scene ${scene.sceneNumber} (${scene.duration}s)`)

    // Submit the generation job
    const submitRes = await fetch(`${HIGGSFIELD_API_URL}/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HIGGSFIELD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!submitRes.ok) {
      const errText = await submitRes.text()
      throw new Error(`Higgsfield submit failed (${submitRes.status}): ${errText}`)
    }

    const submitData = await submitRes.json()
    const generationId = submitData.id

    console.log(`[Video] Higgsfield: Job submitted — ${generationId}`)

    // Poll for completion (max 5 minutes)
    const videoUrl = await pollHiggsfield(generationId)

    console.log(`[Video] Higgsfield: Scene ${scene.sceneNumber} ready`)

    return {
      sceneNumber: scene.sceneNumber,
      videoUrl,
      characterRefUrl: refUrl,
      status: 'ready',
      cost: COSTS.SCENE_GENERATION,
    }
  } catch (error) {
    console.error(`[Video] Higgsfield error for scene ${scene.sceneNumber}:`, error)
    return {
      sceneNumber: scene.sceneNumber,
      videoUrl: '',
      characterRefUrl: refUrl,
      status: 'failed',
      cost: COSTS.SCENE_GENERATION,
    }
  }
}

// ============================================
// HIGGSFIELD POLLING — wait for generation to complete
// ============================================
async function pollHiggsfield(generationId: string): Promise<string> {
  const maxAttempts = 60  // 5 minutes at 5s intervals
  const pollInterval = 5000

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))

    const statusRes = await fetch(`${HIGGSFIELD_API_URL}/generations/${generationId}`, {
      headers: { 'Authorization': `Bearer ${HIGGSFIELD_API_KEY}` },
    })

    if (!statusRes.ok) {
      console.warn(`[Video] Higgsfield poll failed (${statusRes.status}), retrying...`)
      continue
    }

    const statusData = await statusRes.json()

    if (statusData.status === 'completed') {
      // The API returns the video URL in the output
      const videoUrl = statusData.output?.url || statusData.output?.video_url || statusData.url
      if (!videoUrl) throw new Error('Higgsfield completed but no video URL in response')
      return videoUrl
    }

    if (statusData.status === 'failed') {
      throw new Error(`Higgsfield generation failed: ${statusData.error || 'unknown error'}`)
    }

    // Still processing — keep polling
    console.log(`[Video] Higgsfield: Still generating (attempt ${i + 1}/${maxAttempts})...`)
  }

  throw new Error('Higgsfield generation timed out after 5 minutes')
}

// ============================================
// STAGE 3: NARRATION / TTS — ElevenLabs API
// ============================================
async function generateNarration(
  narrationText: string,
  voiceStyle: string | null
): Promise<string> {
  // If no API key, fall back to stub mode
  if (!ELEVENLABS_API_KEY) {
    console.log(`[Video] NO ELEVENLABS KEY — stub mode for narration`)
    return `https://placeholder.continuum.app/audio/narration_${Date.now()}.mp3`
  }

  try {
    const voiceId = voiceStyle || ELEVENLABS_DEFAULT_VOICE

    console.log(`[Video] ElevenLabs: Generating narration (${narrationText.length} chars, voice: ${voiceId})`)

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: narrationText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${errText}`)
    }

    // ElevenLabs returns raw audio bytes
    // In production, upload this to Supabase Storage and return the public URL
    // For now, convert to base64 data URL as a working placeholder
    const audioBuffer = await response.arrayBuffer()
    const base64Audio = Buffer.from(audioBuffer).toString('base64')
    const audioDataUrl = `data:audio/mpeg;base64,${base64Audio}`

    // TODO: Upload to Supabase Storage instead of using data URL
    // const { data } = await supabase.storage
    //   .from('video-audio')
    //   .upload(`narration_${Date.now()}.mp3`, audioBuffer, { contentType: 'audio/mpeg' })
    // return supabase.storage.from('video-audio').getPublicUrl(data.path).data.publicUrl

    console.log(`[Video] ElevenLabs: Narration generated (${audioBuffer.byteLength} bytes)`)

    return audioDataUrl
  } catch (error) {
    console.error('[Video] ElevenLabs error:', error)
    // Fall back to stub URL on error so pipeline doesn't crash
    return `https://placeholder.continuum.app/audio/narration_${Date.now()}.mp3`
  }
}

// ============================================
// STAGE 4: VIDEO STITCHING — Shotstack API
// Takes scene clips + narration audio and renders a final MP4
//
// Env vars:
// - SHOTSTACK_API_KEY: from dashboard.shotstack.io
// - SHOTSTACK_ENV: 'production' for live, anything else uses free sandbox (watermarked)
//
// How it works:
// 1. Build a JSON timeline — each scene clip on a video track, narration on an audio track
// 2. POST to /render — Shotstack queues the render job
// 3. Poll GET /render/{id} until status = 'done'
// 4. Return the final video URL
// ============================================
async function stitchVideo(
  scenes: SceneResult[],
  narrationUrl: string,
  script: VideoScript
): Promise<string> {
  // Filter to only scenes that actually rendered
  const readyScenes = scenes.filter(s => s.status === 'ready' && s.videoUrl && !s.videoUrl.includes('placeholder'))

  // If no API key, fall back to returning first scene as preview
  if (!SHOTSTACK_API_KEY) {
    console.log(`[Video] NO SHOTSTACK KEY — stub mode for stitching`)
    if (readyScenes.length > 0) {
      console.log(`[Video] Returning first scene as preview`)
      return readyScenes[0].videoUrl
    }
    return `https://placeholder.continuum.app/videos/final_${Date.now()}.mp4`
  }

  // If somehow no scenes rendered, nothing to stitch
  if (readyScenes.length === 0) {
    console.warn(`[Video] No ready scenes to stitch — returning placeholder`)
    return `https://placeholder.continuum.app/videos/final_${Date.now()}.mp4`
  }

  try {
    // Build the Shotstack timeline
    // Each scene becomes a clip on a video track, sequenced one after another
    let currentStart = 0
    const videoClips = readyScenes.map((scene) => {
      const sceneScript = script.scenes.find(s => s.sceneNumber === scene.sceneNumber)
      const duration = sceneScript?.duration || 5
      const clip = {
        asset: {
          type: 'video' as const,
          src: scene.videoUrl,
          volume: 0, // mute scene audio — narration replaces it
        },
        start: currentStart,
        length: duration,
      }
      currentStart += duration
      return clip
    })

    // Build audio track for narration (plays over the entire video)
    const audioTrack = {
      clips: [
        {
          asset: {
            type: 'audio' as const,
            src: narrationUrl,
            volume: 1,
          },
          start: 0,
          length: currentStart, // spans the full video length
        },
      ],
    }

    // Video track with all scene clips
    const videoTrack = {
      clips: videoClips,
    }

    const payload = {
      timeline: {
        tracks: [
          videoTrack,  // video on top track
          audioTrack,  // audio on bottom track
        ],
      },
      output: {
        format: 'mp4',
        resolution: 'hd', // 1280x720
        fps: 30,
      },
    }

    console.log(`[Video] Shotstack: Submitting render — ${readyScenes.length} scenes, ${currentStart}s total`)

    // Submit the render job
    const submitRes = await fetch(`${SHOTSTACK_API_URL}/render`, {
      method: 'POST',
      headers: {
        'x-api-key': SHOTSTACK_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!submitRes.ok) {
      const errText = await submitRes.text()
      throw new Error(`Shotstack submit failed (${submitRes.status}): ${errText}`)
    }

    const submitData = await submitRes.json() as { response?: { id?: string } }
    const renderId = submitData.response?.id

    if (!renderId) {
      throw new Error('Shotstack returned no render ID')
    }

    console.log(`[Video] Shotstack: Render queued — ${renderId}`)

    // Poll for completion
    const finalUrl = await pollShotstack(renderId)

    console.log(`[Video] Shotstack: Final video ready`)

    return finalUrl
  } catch (error) {
    console.error('[Video] Shotstack stitching error:', error)

    // Fall back to first scene if stitching fails
    if (readyScenes.length > 0) {
      console.log(`[Video] Falling back to first scene as preview`)
      return readyScenes[0].videoUrl
    }
    return `https://placeholder.continuum.app/videos/final_${Date.now()}.mp4`
  }
}

// ============================================
// SHOTSTACK POLLING — wait for render to complete
// ============================================
async function pollShotstack(renderId: string): Promise<string> {
  const maxAttempts = 60  // 5 minutes at 5s intervals
  const pollInterval = 5000

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))

    const statusRes = await fetch(`${SHOTSTACK_API_URL}/render/${renderId}`, {
      headers: { 'x-api-key': SHOTSTACK_API_KEY },
    })

    if (!statusRes.ok) {
      console.warn(`[Video] Shotstack poll failed (${statusRes.status}), retrying...`)
      continue
    }

    const statusData = await statusRes.json() as {
      response?: { status?: string; url?: string; error?: string }
    }
    const renderStatus = statusData.response?.status

    if (renderStatus === 'done') {
      const videoUrl = statusData.response?.url
      if (!videoUrl) throw new Error('Shotstack render done but no URL in response')
      return videoUrl
    }

    if (renderStatus === 'failed') {
      throw new Error(`Shotstack render failed: ${statusData.response?.error || 'unknown error'}`)
    }

    // Still rendering — keep polling
    console.log(`[Video] Shotstack: Still rendering (attempt ${i + 1}/${maxAttempts})...`)
  }

  throw new Error('Shotstack render timed out after 5 minutes')
}

// ============================================
// GET JOB STATUS — check progress of a video generation
// ============================================
export async function getVideoJobStatus(jobId: string, userId: string) {
  const job = await db.videoJob.findFirst({
    where: { id: jobId, userId },
    include: { character: { select: { name: true } } },
  })

  if (!job) return null

  return {
    id: job.id,
    status: job.status,
    characterName: job.character.name,
    script: job.script,
    scenes: job.scenes,
    narrationUrl: job.narrationUrl,
    finalVideoUrl: job.finalVideoUrl,
    totalCost: job.totalCost,
    duration: job.duration,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

// ============================================
// GET USER'S VIDEO JOBS — list all videos for a user
// ============================================
export async function getUserVideoJobs(userId: string, limit: number = 20) {
  return db.videoJob.findMany({
    where: { userId },
    include: { character: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
