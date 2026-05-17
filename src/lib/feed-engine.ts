// Feed Engine
// Generates continuity timeline items
// Every feed item MUST reference a memory, thread, or state — never random content

import { db } from './db'
import { callLLM } from './llm'
import { getMemoryContext } from './memory-engine'

type FeedType = 'reflection' | 'memory_echo' | 'state_report' | 'thread_update' | 'prompt'

interface FeedCandidate {
  type: FeedType
  content: string
  referenceId: string | null
}

// ============================================
// GENERATE — create new feed items for a user
// Called by background loop (Phase 4), not during chat
// ============================================
export async function generateFeedItems(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return

  const candidates: FeedCandidate[] = []

  // 1. Memory echoes — surface old memories that are relevant
  const memoryEcho = await generateMemoryEcho(userId)
  if (memoryEcho) candidates.push(memoryEcho)

  // 2. Thread updates — check for stale/active threads
  const threadUpdate = await generateThreadUpdate(userId)
  if (threadUpdate) candidates.push(threadUpdate)

  // 3. Reflections — AI reflects on patterns/state
  const reflection = await generateReflection(userId, user.aiName || 'Your AI')
  if (reflection) candidates.push(reflection)

  // 4. Prompts — generate a conversation starter based on memory
  const prompt = await generatePrompt(userId, user.aiName || 'Your AI')
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
  // Get a random fact or older moment
  const memories = await db.memory.findMany({
    where: { userId, type: 'fact' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  if (memories.length === 0) return null

  // Pick a random one
  const memory = memories[Math.floor(Math.random() * memories.length)]

  // Check if we already echoed this recently (avoid repetition)
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
// ============================================
async function generateThreadUpdate(userId: string): Promise<FeedCandidate | null> {
  // Find threads that haven't been touched in 2+ days but are still active
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

  return {
    type: 'thread_update',
    content: `Still open: "${thread.title}"${thread.summary ? ` — ${thread.summary}` : ''}`,
    referenceId: thread.id,
  }
}

// ============================================
// REFLECTION — AI reflects on user patterns
// ============================================
async function generateReflection(userId: string, aiName: string): Promise<FeedCandidate | null> {
  const memoryContext = await getMemoryContext(userId)
  if (!memoryContext || memoryContext.length < 50) return null

  // Don't generate reflections too often
  const recentReflections = await db.feedItem.findMany({
    where: {
      userId,
      type: 'reflection',
      createdAt: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
  })

  if (recentReflections.length > 0) return null

  try {
    const result = await callLLM(
      `You are ${aiName}. Based on what you know about this person, write ONE short reflection (1-2 sentences). It should feel like a thought you had about them — something you noticed, a pattern, or a gentle observation. Be warm but not performative. Don't ask questions. Don't say "I noticed" — just state the thought.

Memory context:
${memoryContext}`,
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
// ============================================
async function generatePrompt(userId: string, aiName: string): Promise<FeedCandidate | null> {
  const memoryContext = await getMemoryContext(userId)
  if (!memoryContext || memoryContext.length < 50) return null

  // Don't generate prompts too often
  const recentPrompts = await db.feedItem.findMany({
    where: {
      userId,
      type: 'prompt',
      createdAt: { gt: new Date(Date.now() - 8 * 60 * 60 * 1000) },
    },
  })

  if (recentPrompts.length > 0) return null

  try {
    const result = await callLLM(
      `You are ${aiName}. Based on what you know about this person, write ONE short conversation starter (1 sentence). It should reference something specific from their memory — a goal, a project, a decision they mentioned. Frame it as something natural to check in about. Don't be generic.

Memory context:
${memoryContext}`,
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
