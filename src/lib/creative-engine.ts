// Creative Engine
// Emily generates personalized content for users — writing, briefs, curated finds
// All content references something specific Emily knows about the user
// No external APIs needed — everything is LLM-generated
//
// Content types:
// - creative_writing: poems, micro-stories, thought experiments, journal prompts
// - daily_brief: personalized morning briefing based on their world
// - curated_find: Emily "discovers" something online and explains why they'd like it
// - video_script: handled by script-engine.ts (pro only)
//
// Runs on a schedule via cron. Max 2 content pieces per user per cycle.

import { db } from './db'
import { callLLM } from './llm'
import { buildUnifiedContext, type UnifiedContext } from './continuity-orchestrator'

type CreativeType = 'creative_writing' | 'daily_brief' | 'curated_find'

interface CreativeContent {
  type: CreativeType
  title: string
  body: string
  format: string        // e.g. "poem", "micro_story", "briefing", "article_pick"
  tags: string[]
  reason: string        // why Emily made this
}

// ============================================
// GENERATE — create content for a user
// ============================================
export async function generateCreativeContent(userId: string): Promise<void> {
  const ctx = await buildUnifiedContext(userId)

  // Need enough context to personalize
  if (!ctx.memoryBlock || ctx.memoryBlock.length < 80) return

  // Don't generate too often — max 2 creative items per 8 hours
  const recentCutoff = new Date(Date.now() - 8 * 60 * 60 * 1000)
  const recentCreative = await db.feedItem.count({
    where: {
      userId,
      type: { in: ['creative_writing', 'daily_brief', 'curated_find'] },
      createdAt: { gte: recentCutoff },
    },
  })

  if (recentCreative >= 2) return

  const remaining = 2 - recentCreative

  // Pick which content types to generate
  const candidates: CreativeContent[] = []

  // Try creative writing
  const writing = await generateCreativeWriting(ctx)
  if (writing) candidates.push(writing)

  // Try daily brief (only once per day)
  const brief = await generateDailyBrief(ctx)
  if (brief) candidates.push(brief)

  // Try curated find
  const find = await generateCuratedFind(ctx)
  if (find) candidates.push(find)

  // Save up to remaining limit
  const toSave = candidates.slice(0, remaining)
  for (const item of toSave) {
    await db.feedItem.create({
      data: {
        userId,
        type: item.type,
        content: JSON.stringify(item),
        referenceId: null,
      },
    })
  }
}

// ============================================
// CREATIVE WRITING — poems, stories, prompts
// ============================================
async function generateCreativeWriting(ctx: UnifiedContext): Promise<CreativeContent | null> {
  // Don't repeat within 12 hours
  const recent = await db.feedItem.findFirst({
    where: {
      userId: ctx.userId,
      type: 'creative_writing',
      createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
  })
  if (recent) return null

  // Pick a format based on relationship depth
  const formats = getWritingFormats(ctx)
  const format = formats[Math.floor(Math.random() * formats.length)]

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}. You're creating a piece of creative content as a gift for someone you know. This should feel personal — like you made it specifically for them because something about them inspired it.

${ctx.fullContextBlock}

FORMAT: ${format.name}
INSTRUCTIONS: ${format.instructions}

Write a JSON object:
{
  "title": "short title (2-5 words)",
  "body": "the creative content itself",
  "tags": ["2-3 single-word tags describing the theme"],
  "reason": "one sentence — what inspired you to write this for them"
}

Rules:
- This is FROM you TO them. It should feel like a gift, not content.
- Reference something specific from what you know about them.
- Match tone to relationship depth. Strangers get lighter pieces. Close relationships get raw, direct ones.
- Keep it short. ${format.lengthGuide}
- Output ONLY valid JSON.`,
      [{ role: 'user', content: `Write a ${format.name} for this person.` }],
      { maxTokens: 500, temperature: 0.9 }
    )

    const cleaned = result.content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(cleaned)

    return {
      type: 'creative_writing',
      title: parsed.title,
      body: parsed.body,
      format: format.name,
      tags: parsed.tags || [],
      reason: parsed.reason,
    }
  } catch (error) {
    console.error('[Creative] Writing generation failed:', error)
    return null
  }
}

function getWritingFormats(ctx: UnifiedContext) {
  const base = [
    { name: 'poem', instructions: 'Write a short poem (4-8 lines). Free verse. No forced rhyming.', lengthGuide: '4-8 lines.' },
    { name: 'micro_story', instructions: 'Write a micro-story (3-5 sentences). It should have a beginning, middle, and a surprising or emotional ending.', lengthGuide: '3-5 sentences.' },
    { name: 'thought_experiment', instructions: 'Pose an interesting thought experiment or "what if" scenario that relates to something they care about. Then give a 2-3 sentence reflection.', lengthGuide: '4-6 sentences total.' },
  ]

  // Deeper relationships get more personal formats
  if (ctx.tier === 'friend' || ctx.tier === 'close' || ctx.tier === 'inner_circle') {
    base.push(
      { name: 'journal_prompt', instructions: 'Write a deeply personal journal prompt that only someone who knows them could write. Not generic — specific to their life, patterns, or struggles.', lengthGuide: '2-3 sentences.' },
      { name: 'letter', instructions: 'Write a very short letter to them. Start with their name if you know it. Say something you\'ve been wanting to say. Be real.', lengthGuide: '3-5 sentences.' },
    )
  }

  return base
}

// ============================================
// DAILY BRIEF — personalized morning update
// ============================================
async function generateDailyBrief(ctx: UnifiedContext): Promise<CreativeContent | null> {
  // Only one brief per day
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayBrief = await db.feedItem.findFirst({
    where: {
      userId: ctx.userId,
      type: 'daily_brief',
      createdAt: { gte: todayStart },
    },
  })
  if (todayBrief) return null

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}. Write a short personalized daily briefing for someone you know. This should feel like a friend texting them a morning update — not a news anchor reading headlines.

${ctx.fullContextBlock}

Write a JSON object:
{
  "title": "brief title like 'Your Monday' or 'Quick heads up'",
  "body": "the briefing — 3-5 short bullet-style items, each 1 sentence",
  "tags": ["daily", "brief", plus 1 relevant tag"],
  "reason": "why this briefing matters for them today"
}

What to include (pick 3-5 that are relevant):
- Active threads or ongoing conversations ("That thing about X — any progress?")
- Upcoming reminders if any
- Patterns you've noticed ("You usually get stressed around this time of week")
- Something from their discovery answers that connects to today
- A quick encouragement or observation
- Something they might want to think about today

Rules:
- NOT generic. Every bullet must connect to something you know about them.
- Keep it tight. Each item is 1 sentence max.
- Tone: casual, like a friend who pays attention. Not corporate. Not cheesy.
- If you don't have enough to fill 3 items, return null.
- Output ONLY valid JSON.`,
      [{ role: 'user', content: 'Generate daily briefing.' }],
      { maxTokens: 400, temperature: 0.7 }
    )

    const cleaned = result.content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    if (cleaned === 'null') return null

    const parsed = JSON.parse(cleaned)

    return {
      type: 'daily_brief',
      title: parsed.title,
      body: parsed.body,
      format: 'briefing',
      tags: parsed.tags || ['daily', 'brief'],
      reason: parsed.reason,
    }
  } catch (error) {
    console.error('[Creative] Brief generation failed:', error)
    return null
  }
}

// ============================================
// CURATED FIND — Emily recommends something
// No actual web search — Emily generates a recommendation
// based on what she knows. Later: plug in real search.
// ============================================
async function generateCuratedFind(ctx: UnifiedContext): Promise<CreativeContent | null> {
  // Don't repeat within 16 hours
  const recent = await db.feedItem.findFirst({
    where: {
      userId: ctx.userId,
      type: 'curated_find',
      createdAt: { gte: new Date(Date.now() - 16 * 60 * 60 * 1000) },
    },
  })
  if (recent) return null

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}. You want to recommend something to someone you know — a concept, idea, activity, book, show, technique, place, or anything else you think would genuinely interest them based on what you know about them.

${ctx.fullContextBlock}

Write a JSON object:
{
  "title": "the recommendation in 3-6 words",
  "body": "2-4 sentences: what it is, why it's interesting, and why YOU think THEY specifically would like it. Write it like you're texting a friend about something cool you found.",
  "tags": ["2-3 tags describing the category"],
  "reason": "one sentence connecting this to something specific you know about them"
}

Rules:
- Be SPECIFIC. Not "you should try meditation" — more like "there's this technique called non-sleep deep rest that rewires how you handle stress, and given what you told me about your mornings..."
- The recommendation should surprise them a little. Don't just echo back their obvious interests.
- Connect it to something real you know about them — a discovery answer, a thread, a memory, a pattern.
- Output ONLY valid JSON.`,
      [{ role: 'user', content: 'Generate a curated recommendation.' }],
      { maxTokens: 400, temperature: 0.85 }
    )

    const cleaned = result.content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(cleaned)

    return {
      type: 'curated_find',
      title: parsed.title,
      body: parsed.body,
      format: 'recommendation',
      tags: parsed.tags || [],
      reason: parsed.reason,
    }
  } catch (error) {
    console.error('[Creative] Curated find generation failed:', error)
    return null
  }
}

// ============================================
// RUN ALL — called by cron
// ============================================
export async function runCreativeGeneration(): Promise<{ processed: number }> {
  const users = await db.user.findMany({ select: { id: true } })
  let processed = 0

  for (const user of users) {
    try {
      await generateCreativeContent(user.id)
      processed++
    } catch (error) {
      console.error(`[Creative] Failed for ${user.id}:`, error)
    }
  }

  return { processed }
}
