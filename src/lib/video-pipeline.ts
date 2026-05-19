// Video Generation Pipeline — Powered by Higgsfield + ElevenLabs
// Takes a character + user preferences and produces a finished video
//
// Pipeline stages:
// 1. SCRIPTING — LLM generates a video script (scene-by-scene)
// 2. GENERATING — Higgsfield API generates each scene as a clip (Kling 3.0)
// 3. NARRATION — ElevenLabs generates voiceover from script narration
// 4. STITCHING — FFmpeg combines clips + audio into final video (STUBBED)
// 5. READY — Final video available for download
//
// Env vars needed:
// - HIGGSFIELD_API_KEY: API key from cloud.higgsfield.ai/dashboard
// - ELEVENLABS_API_KEY: API key from elevenlabs.io
// - ELEVENLABS_VOICE_ID: default voice ID (optional, falls back to 'Rachel')
//
// Stitching is still stubbed — needs a server with FFmpeg or a cloud
// video processing service (like Creatomate, Shotstack, or a Vercel
// Edge Function with FFmpeg WASM). Everything else is live.
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

// ============================================
// COST CONSTANTS (real costs based on Higgsfield Kling 3.0 + ElevenLabs)
// ============================================
const COSTS = {
  SCRIPT_GENERATION: 0.03,     // LLM call for script
  SCENE_GENERATION: 0.29,      // per scene — Kling 3.0 via Higgsfield (~6 credits on Plus)
  NARRATION_TTS: 0.04,         // ElevenLabs TTS per video
  STITCHING: 0.00,             // FFmpeg is free (server compute)
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

  // 2. Verify character exists and belongs to user
  const character = await db.character.findFirst({
    where: { id: characterId, userId, isActive: true },
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
  character: { id: string; name: string; personality: unknown; imageUrls: unknown; voiceStyle: string | null },
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

async function generateSceneVideo(
  scene: VideoScene,
  character: { imageUrls: unknown }
): Promise<SceneResult> {
  // Get first character image as reference (if available)
  const images = character.imageUrls as Array<{ url: string }> | null
  const refUrl = images && images.length > 0 ? images[0].url : null

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
// STAGE 4: VIDEO STITCHING (STUBBED)
// Needs a server with FFmpeg or a cloud video service
// Options: Creatomate, Shotstack, or self-hosted FFmpeg
// ============================================
async function stitchVideo(
  scenes: SceneResult[],
  narrationUrl: string,
  script: VideoScript
): Promise<string> {
  // TODO: Replace with real video stitching
  // Option 1 — Creatomate API:
  //   const response = await fetch('https://api.creatomate.com/v1/renders', {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${CREATOMATE_API_KEY}`, 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       template_id: 'YOUR_TEMPLATE',
  //       modifications: scenes.map(s => ({ src: s.videoUrl })),
  //       audio: narrationUrl,
  //     })
  //   })
  //
  // Option 2 — Self-hosted FFmpeg (on a separate server, not Vercel):
  //   ffmpeg -i scene1.mp4 -i scene2.mp4 -i scene3.mp4 -i narration.mp3 \
  //     -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]adelay=0[a]" \
  //     -map "[v]" -map "[a]" -c:v libx264 -c:a aac output.mp4
  //
  // Option 3 — Shotstack API:
  //   POST https://api.shotstack.io/edit/v1/render with timeline JSON

  // For now: if all scenes have real URLs, return the first scene's video
  // This gives the user SOMETHING while stitching is being built out
  const firstReadyScene = scenes.find(s => s.status === 'ready' && s.videoUrl && !s.videoUrl.includes('placeholder'))
  if (firstReadyScene) {
    console.log(`[Video] Stitching not yet implemented — returning first scene as preview`)
    return firstReadyScene.videoUrl
  }

  console.log(`[Video] STUB: Would stitch ${scenes.length} scenes + narration into ${script.totalDuration}s video`)
  return `https://placeholder.continuum.app/videos/final_${Date.now()}.mp4`
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
