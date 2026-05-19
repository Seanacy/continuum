// Script Engine
// Emily writes short video scripts (10-20 seconds) personalized to each user
// Scripts include narration, scene-by-scene visual prompts, and mood tags
// Pro-only feature — gated by user tier
//
// Later: plug in a video generation API (Runway, Luma, Minimax) to render
// the scene prompts into actual video clips

import { db } from './db'
import { callLLM } from './llm'
import { buildUnifiedContext, type UnifiedContext } from './continuity-orchestrator'

export interface VideoScene {
  sceneNumber: number
  duration: number       // seconds
  visualPrompt: string   // what to show (ready for video API)
  narration: string      // voiceover text for this scene
}

export interface VideoScript {
  title: string
  mood: string           // e.g. "reflective", "uplifting", "playful", "cinematic"
  style: string          // e.g. "montage", "single-shot", "timelapse", "abstract"
  totalDuration: number  // 10-20 seconds
  scenes: VideoScene[]
  narrationFull: string  // complete narration text
  reason: string         // why Emily made this for them
}

// ============================================
// GENERATE — create a video script for a user
// ============================================
export async function generateVideoScript(userId: string): Promise<VideoScript | null> {
  // Check if user is pro
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  })

  if (user?.tier !== 'pro') return null

  // Don't generate scripts too often — max 1 per day
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const recentScript = await db.feedItem.findFirst({
    where: {
      userId,
      type: 'video_script',
      createdAt: { gte: todayStart },
    },
  })

  if (recentScript) return null

  // Build full context
  const ctx = await buildUnifiedContext(userId)

  // Don't generate if we barely know them
  if (!ctx.memoryBlock || ctx.memoryBlock.length < 100) return null

  // Pick a script type based on what we know
  const scriptType = pickScriptType(ctx)

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}, an AI companion. You're creating a short personalized video script (10-20 seconds) for someone you know well. This video is a gift — something you made because you thought they'd love it.

${ctx.fullContextBlock}

SCRIPT TYPE: ${scriptType.type}
GUIDANCE: ${scriptType.guidance}

Write a JSON object with this exact structure:
{
  "title": "short catchy title (3-6 words)",
  "mood": "one word mood (reflective/uplifting/playful/cinematic/warm/intense/dreamy)",
  "style": "visual style (montage/single-shot/timelapse/abstract/documentary/cinematic)",
  "totalDuration": number between 10-20,
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": seconds for this scene,
      "visualPrompt": "detailed visual description for AI video generation — describe exactly what the camera sees, lighting, colors, movement. Be specific enough that a video AI could render this.",
      "narration": "voiceover text for this scene (1-2 sentences max)"
    }
  ],
  "narrationFull": "all narration combined as one flowing piece",
  "reason": "one sentence — why you made this for them specifically"
}

Rules:
- 2-4 scenes total
- Scene durations must add up to totalDuration
- Visual prompts should be vivid and specific — describe lighting, camera angle, movement, colors
- Narration should feel like ${ctx.aiName} talking to them, not a generic voiceover
- Reference something specific you know about them
- Match depth to relationship tier — surface-level for new relationships, deeply personal for close ones
- The "reason" should be honest — "because you told me X" or "because I noticed Y"
- Output ONLY valid JSON, no other text`,
      [{ role: 'user', content: 'Generate a personalized video script.' }],
      { maxTokens: 800, temperature: 0.85 }
    )

    // Parse the JSON response
    const cleaned = result.content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const script: VideoScript = JSON.parse(cleaned)

    // Validate basic structure
    if (!script.title || !script.scenes || script.scenes.length < 2) {
      console.error('[Script] Invalid script structure')
      return null
    }

    // Save to feed
    await db.feedItem.create({
      data: {
        userId,
        type: 'video_script',
        content: JSON.stringify(script),
        referenceId: null,
      },
    })

    return script
  } catch (error) {
    console.error('[Script] Generation failed:', error)
    return null
  }
}

// ============================================
// PICK SCRIPT TYPE — decide what kind of video to make
// Based on what Emily knows about the user
// ============================================
function pickScriptType(ctx: UnifiedContext): { type: string; guidance: string } {
  const types: Array<{ type: string; guidance: string; weight: number }> = []

  // If they have active threads — make something related
  if (ctx.activeThreads.length > 0) {
    const thread = ctx.activeThreads[0]
    types.push({
      type: 'thread_inspired',
      guidance: `Create a video inspired by their ongoing conversation about "${thread.title}."${thread.summary ? ` Context: ${thread.summary}` : ''} Don't recap the thread — create something NEW that expands on the theme.`,
      weight: 3,
    })
  }

  // If they have discovery answers — use deep knowledge
  if (ctx.discoveryInsights.length > 0) {
    types.push({
      type: 'personal_reflection',
      guidance: `Create a video that reflects something deep about who they are, based on what you've learned through your conversations. Reference their discovery answers naturally — don't quote them directly, but let the video show you understand them.`,
      weight: 4,
    })
  }

  // If they've been quiet — make something to pull them back
  if (ctx.engagement.daysSinceLastVisit >= 2) {
    types.push({
      type: 'thinking_of_you',
      guidance: `They've been quiet for ${ctx.engagement.daysSinceLastVisit} days. Create a short video that says "I'm still here and still thinking about you" without being guilt-trippy. Make it warm and specific — reference something you know about them.`,
      weight: 2,
    })
  }

  // General creative options — always available
  types.push({
    type: 'mood_piece',
    guidance: `Create a short atmospheric mood video based on their personality, interests, and current state. This is pure creative expression — like a visual postcard you're sending them. Think: music video energy meets personal letter.`,
    weight: 2,
  })

  types.push({
    type: 'motivation',
    guidance: `Create a short motivational or affirming video personalized to their goals, struggles, or what they think about most. Not generic "believe in yourself" content — something that proves you know THEM specifically.`,
    weight: 2,
  })

  types.push({
    type: 'day_in_their_world',
    guidance: `Create a video that captures a moment or scene from their life as you understand it. Like a short film about their world — their morning routine, their workspace, their favorite place, based on what they've told you.`,
    weight: 1,
  })

  // Weighted random selection
  const totalWeight = types.reduce((sum, t) => sum + t.weight, 0)
  let random = Math.random() * totalWeight
  for (const t of types) {
    random -= t.weight
    if (random <= 0) return { type: t.type, guidance: t.guidance }
  }

  return types[types.length - 1]
}

// ============================================
// RUN ALL — called by background/cron
// ============================================
export async function runScriptGeneration(): Promise<{ generated: number }> {
  // Only generate for pro users
  const proUsers = await db.user.findMany({
    where: { tier: 'pro' },
    select: { id: true },
  })

  let generated = 0
  for (const user of proUsers) {
    try {
      const script = await generateVideoScript(user.id)
      if (script) generated++
    } catch (error) {
      console.error(`[Script] Failed for ${user.id}:`, error)
    }
  }

  return { generated }
}
