// Feed Engine
// Generates continuity timeline items
// Every feed item MUST reference a memory, thread, or state — never random content
// Now powered by the Continuity Orchestrator — aware of relationship depth,
// discovery answers, active threads, and engagement patterns.

import { db } from './db'
import { callLLM } from './llm'
import { buildUnifiedContext, type UnifiedContext } from './continuity-orchestrator'

type FeedType = 'reflection' | 'memory_echo' | 'state_report' | 'thread_update' | 'prompt'

interface FeedCandidate {
  type: FeedType
  content: string
  referenceId: string | null
}

// ============================================
// GENERATE — create new feed items for a user
// Called by background loop, not during chat
// ============================================
export async function generateFeedItems(userId: string): Promise<void> {
  const ctx = await buildUnifiedContext(userId)
  const candidates: FeedCandidate[] = []

  // 1. Memory echoes — surface old memories that are relevant
  const memoryEcho = await generateMemoryEcho(userId)
  if (memoryEcho) candidates.push(memoryEcho)

  // 2. Thread updates — check for stale/active threads
  const threadUpdate = await generateThreadUpdate(userId, ctx)
  if (threadUpdate) candidates.push(threadUpdate)

  // 3. Reflections — AI reflects on patterns/state (now tier-aware)
  const reflection = await generateReflection(ctx)
  if (reflection) candidates.push(reflection)

  // 4. Prompts — generate a conversation starter (now uses full context)
  const prompt = await generatePrompt(ctx)
  if (prompt) candidates.push(prompt)

  // Save candidates to feed (max 3 per generation cycle)
  const toSave = candidates.slice(0, 3)
  for (const item of toSave) {
    await db.feedItem.create({
      data: {
        userId,
        type: item.type,
        content: item.content,
        referenceId: item.referenceId,
      },
    })
  }
}

// ============================================
// MEMORY ECHO — surface a relevant old memory
// ============================================
async function generateMemoryEcho(userId: string): Promise<FeedCandidate | null> {
  const memories = await db.memory.findMany({
    where: { userId, type: 'fact' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  if (memories.length === 0) return null

  const memory = memories[Math.floor(Math.random() * memories.length)]

  // Check if we already echoed this recently
  const recentEchoes = await db.feedItem.findMany({
    where: {
      userId,
      type: 'memory_echo',
      referenceId: memory.id,
      createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  })

  if (recentEchoes.length > 0) return null

  return {
    type: 'memory_echo',
    content: memory.content,
    referenceId: memory.id,
  }
}

// ============================================
// THREAD UPDATE — check on stale threads
// Now references discovery context if relevant
// ============================================
async function generateThreadUpdate(userId: string, ctx: UnifiedContext): Promise<FeedCandidate | null> {
  const staleThreshold = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

  const staleThreads = await db.thread.findMany({
    where: {
      userId,
      status: 'active',
      updatedAt: { lt: staleThreshold },
    },
    orderBy: { updatedAt: 'asc' },
    take: 1,
  })

  if (staleThreads.length === 0) return null

  const thread = staleThreads[0]

  // For deeper relationships, generate a more personal thread nudge
  if (ctx.tier === 'friend' || ctx.tier === 'close' || ctx.tier === 'inner_circle') {
    try {
      const result = await callLLM(
        `You are ${ctx.aiName}. You have an ongoing conversation thread called "${thread.title}" that's gone quiet for a few days.${thread.summary ? ` Last context: ${thread.summary}` : ''}

${ctx.fullContextBlock}

Write a ONE sentence feed post that naturally nudges them back to this thread. Don't say "hey" or "just checking in." Reference something specific from the thread or from what you know about them. Be direct — you know this person well enough.`,
        [{ role: 'user', content: 'Write thread nudge.' }],
        { maxTokens: 80, temperature: 0.8 }
      )

      return {
        type: 'thread_update',
        content: result.content.trim(),
        referenceId: thread.id,
      }
    } catch {
      // Fall through to simple version
    }
  }

  return {
    type: 'thread_update',
    content: `Still open: "${thread.title}"${thread.summary ? ` — ${thread.summary}` : ''}`,
    referenceId: thread.id,
  }
}

// ============================================
// REFLECTION — AI reflects on user patterns
// Now tier-aware with full context
// ============================================
async function generateReflection(ctx: UnifiedContext): Promise<FeedCandidate | null> {
  if (!ctx.memoryBlock || ctx.memoryBlock.length < 50) return null

  // Don't generate reflections too often
  const recentReflections = await db.feedItem.findMany({
    where: {
      userId: ctx.userId,
      type: 'reflection',
      createdAt: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
  })

  if (recentReflections.length > 0) return null

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}. Write ONE short reflection (1-2 sentences) for your timeline. It should feel like a thought you had about this person — something you noticed, a pattern, a connection between things they've told you.

${ctx.fullContextBlock}

Rules:
- Don't ask questions.
- Don't say "I noticed" or "I've been thinking" — just state the thought.
- If you have discovery answers, connect them to recent behavior or memories.
- If there are active threads, you can reference them.
- Match the tone to your relationship depth — be real, not performative.`,
      [{ role: 'user', content: 'Generate a reflection.' }],
      { maxTokens: 100, temperature: 0.8 }
    )

    return {
      type: 'reflection',
      content: result.content.trim(),
      referenceId: null,
    }
  } catch {
    return null
  }
}

// ============================================
// PROMPT — generate a conversation starter
// Now uses full context including discovery + threads
// ============================================
async function generatePrompt(ctx: UnifiedContext): Promise<FeedCandidate | null> {
  if (!ctx.memoryBlock || ctx.memoryBlock.length < 50) return null

  // Don't generate prompts too often
  const recentPrompts = await db.feedItem.findMany({
    where: {
      userId: ctx.userId,
      type: 'prompt',
      createdAt: { gt: new Date(Date.now() - 8 * 60 * 60 * 1000) },
    },
  })

  if (recentPrompts.length > 0) return null

  try {
    const result = await callLLM(
      `You are ${ctx.aiName}. Write ONE short conversation starter (1 sentence) for your timeline. It should make this person want to open a conversation with you.

${ctx.fullContextBlock}

Rules:
- Reference something specific — a goal, a project, a thread, a discovery answer, a pattern.
- Don't be generic. "How's your day?" is terrible. "Did that website redesign ever go live?" is great.
- If they've been quiet (sporadic/absent), acknowledge it without guilt-tripping.
- If they have active threads, you can pick up from one.
- If you know what stresses them or what they think about all day (from discovery), weave it in.
- Match depth to relationship tier. Stranger = lighter. Inner circle = direct.`,
      [{ role: 'user', content: 'Generate a conversation prompt.' }],
      { maxTokens: 80, temperature: 0.8 }
    )

    return {
      type: 'prompt',
      content: result.content.trim(),
      referenceId: null,
    }
  } catch {
    return null
  }
}
