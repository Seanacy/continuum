// Video Generation Pipeline
// Takes a character + user preferences and produces a finished video
//
// Pipeline stages:
// 1. SCRIPTING — LLM generates a video script (scene-by-scene)
// 2. GENERATING — Video API generates each scene as a clip
// 3. NARRATION — TTS generates voiceover from script narration
// 4. STITCHING — FFmpeg combines clips + audio into final video
// 5. READY — Final video available for download
//
// All API calls are STUBBED — the pipeline logic works end-to-end
// but returns placeholder URLs. When you plug in real APIs:
// - Replace generateSceneVideo() with Runway/Luma/Minimax calls
// - Replace generateNarration() with ElevenLabs/OpenAI TTS calls
// - Replace stitchVideo() with real FFmpeg processing
//
// Cost tracking: every API call logs its cost so we know actual margins

import { db } from './db'
import { callLLM } from './llm'
import { buildUnifiedContext } from './continuity-orchestrator'
import { spendVideoCredit } from './credit-system'
import type { VideoScript, VideoScene } from './script-engine'

// ============================================
// COST CONSTANTS (estimates — update when APIs are connected)
// ============================================
const COSTS = {
  SCRIPT_GENERATION: 0.02,     // LLM call for script
  SCENE_GENERATION: 0.15,      // per scene video generation
  CHARACTER_REF: 0.03,         // per scene character reference image
  NARRATION_TTS: 0.02,         // voiceover generation
  STITCHING: 0.00,             // FFmpeg is free
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
    data: { script: script as unknown as Record<string, unknown>, duration: script.totalDuration, totalCost },
  })

  // ---- STAGE 2: GENERATING SCENES ----
  await db.videoJob.update({ where: { id: jobId }, data: { status: 'generating' } })

  const sceneResults = []
  for (const scene of script.scenes) {
    const result = await generateSceneVideo(scene, character)
    totalCost += COSTS.SCENE_GENERATION + COSTS.CHARACTER_REF
    sceneResults.push(result)
  }

  await db.videoJob.update({
    where: { id: jobId },
    data: { scenes: sceneResults, totalCost },
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
// STAGE 2: SCENE VIDEO GENERATION (STUBBED)
// ============================================
interface SceneResult {
  sceneNumber: number
  videoUrl: string      // URL to the generated video clip
  characterRefUrl: string | null  // character reference image used
  status: 'ready' | 'failed'
  cost: number
}

async function generateSceneVideo(
  scene: VideoScene,
  character: { imageUrls: unknown }
): Promise<SceneResult> {
  // TODO: Replace with real video API call
  // Example with Runway:
  //   const response = await runway.generate({
  //     prompt: scene.visualPrompt,
  //     duration: scene.duration,
  //     referenceImage: characterImageUrl,
  //   })
  //
  // Example with Minimax:
  //   const response = await minimax.videoGeneration({
  //     prompt: scene.visualPrompt,
  //     duration: scene.duration,
  //   })

  console.log(`[Video] STUB: Would generate scene ${scene.sceneNumber} (${scene.duration}s)`)
  console.log(`[Video] STUB: Visual prompt: ${scene.visualPrompt.substring(0, 100)}...`)

  // Get first character image as reference (if available)
  const images = character.imageUrls as Array<{ url: string }> | null
  const refUrl = images && images.length > 0 ? images[0].url : null

  return {
    sceneNumber: scene.sceneNumber,
    videoUrl: `https://placeholder.continuum.app/scenes/scene_${scene.sceneNumber}_${Date.now()}.mp4`,
    characterRefUrl: refUrl,
    status: 'ready',
    cost: COSTS.SCENE_GENERATION + COSTS.CHARACTER_REF,
  }
}

// ============================================
// STAGE 3: NARRATION / TTS (STUBBED)
// ============================================
async function generateNarration(
  narrationText: string,
  voiceStyle: string | null
): Promise<string> {
  // TODO: Replace with real TTS API call
  // Example with ElevenLabs:
  //   const audio = await elevenlabs.textToSpeech({
  //     text: narrationText,
  //     voice_id: voiceStyle || 'default',
  //   })
  //   return uploadToStorage(audio)
  //
  // Example with OpenAI TTS:
  //   const audio = await openai.audio.speech.create({
  //     model: 'tts-1',
  //     voice: voiceStyle || 'alloy',
  //     input: narrationText,
  //   })

  console.log(`[Video] STUB: Would generate narration (${narrationText.length} chars, voice: ${voiceStyle || 'default'})`)

  return `https://placeholder.continuum.app/audio/narration_${Date.now()}.mp3`
}

// ============================================
// STAGE 4: VIDEO STITCHING (STUBBED)
// ============================================
async function stitchVideo(
  scenes: SceneResult[],
  narrationUrl: string,
  script: VideoScript
): Promise<string> {
  // TODO: Replace with real FFmpeg processing
  // In production, this would:
  // 1. Download all scene video clips
  // 2. Download the narration audio
  // 3. Use FFmpeg to:
  //    - Concatenate scenes in order
  //    - Overlay narration audio
  //    - Add transitions between scenes
  //    - Export as final MP4
  // 4. Upload final video to storage
  // 5. Return the public URL
  //
  // FFmpeg command would look something like:
  //   ffmpeg -i scene1.mp4 -i scene2.mp4 -i scene3.mp4 -i narration.mp3 \
  //     -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]adelay=0[a]" \
  //     -map "[v]" -map "[a]" -c:v libx264 -c:a aac output.mp4

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
