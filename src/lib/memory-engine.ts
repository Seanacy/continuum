// Memory Engine
// Handles: retrieving relevant memories, injecting into prompts,
// extracting new memories from conversations, and summarization

import { db } from './db'
import { callLLM } from './llm'

const MEMORY_TOKEN_CAP = 800 // max tokens of memory injected per prompt
const APPROX_CHARS_PER_TOKEN = 4

// ============================================
// RETRIEVE — get relevant memories for prompt injection
// ============================================
export async function getMemoryContext(userId: string): Promise<string> {
  // Get all facts (permanent)
  const facts = await db.memory.findMany({
    where: { userId, type: 'fact' },
    orderBy: { weight: 'desc' },
    take: 20,
  })

  // Get recent moments (summarized conversations)
  const moments = await db.memory.findMany({
    where: { userId, type: 'moment' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Get active signals (behavioral patterns)
  const signals = await db.memory.findMany({
    where: { userId, type: 'signal' },
    orderBy: { weight: 'desc' },
    take: 5,
  })

  // Build memory block
  let memoryBlock = ''

  if (facts.length > 0) {
    memoryBlock += '## Known Facts\n'
    memoryBlock += facts.map((f: { content: string }) => `- ${f.content}`).join('\n')
    memoryBlock += '\n\n'
  }

  if (moments.length > 0) {
    memoryBlock += '## Recent Context\n'
    memoryBlock += moments.map((m: { content: string }) => `- ${m.content}`).join('\n')
    memoryBlock += '\n\n'
  }

  if (signals.length > 0) {
    memoryBlock += '## Behavioral Patterns\n'
    memoryBlock += signals.map((s: { content: string }) => `- ${s.content}`).join('\n')
    memoryBlock += '\n\n'
  }

  // Enforce token cap
  const maxChars = MEMORY_TOKEN_CAP * APPROX_CHARS_PER_TOKEN
  if (memoryBlock.length > maxChars) {
    memoryBlock = memoryBlock.slice(0, maxChars) + '\n[memory truncated]'
  }

  return memoryBlock
}

// ============================================
// EXTRACT — pull new memories from a conversation
// ============================================
export async function extractMemories(
  userId: string,
  messages: { role: string; content: string }[]
): Promise<void> {
  // Only extract after every 5 messages minimum
  const userMessages = messages.filter((m) => m.role === 'user')
  if (userMessages.length < 5) return

  // Get last few exchanges for extraction
  const recentExchanges = messages.slice(-10)
  const conversationText = recentExchanges
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const extractionPrompt = `You are a memory extraction system. Analyze this conversation and extract any new information worth remembering.

Output JSON with three arrays:
- "facts": permanent details about the user (name, job, preferences, relationships, goals)
- "moments": brief summary of what was discussed/decided (1-2 sentences max each)
- "signals": behavioral patterns you notice (communication style, interests, habits)

Rules:
- Only extract NEW information, not things already obvious
- Facts should be atomic (one fact per item)
- Moments should be concise summaries, not transcriptions
- Signals should be patterns, not one-off behaviors
- If nothing new is worth remembering, return empty arrays
- Output ONLY valid JSON, no other text

Conversation:
${conversationText}`

  try {
    const result = await callLLM(extractionPrompt, [
      { role: 'user', content: 'Extract memories from this conversation.' },
    ], { maxTokens: 500, temperature: 0.3 })

    const parsed = JSON.parse(result.content)

    // Store facts
    if (parsed.facts?.length) {
      for (const fact of parsed.facts) {
        await db.memory.create({
          data: {
            userId,
            type: 'fact',
            content: fact,
            source: 'extraction',
            weight: 1.0,
          },
        })
      }
    }

    // Store moments
    if (parsed.moments?.length) {
      for (const moment of parsed.moments) {
        await db.memory.create({
          data: {
            userId,
            type: 'moment',
            content: moment,
            source: 'extraction',
            weight: 0.8,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        })
      }
    }

    // Store signals
    if (parsed.signals?.length) {
      for (const signal of parsed.signals) {
        await db.memory.create({
          data: {
            userId,
            type: 'signal',
            content: signal,
            source: 'inference',
            weight: 0.5,
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
          },
        })
      }
    }
  } catch (error) {
    // Memory extraction is non-critical — log and continue
    console.error('Memory extraction failed:', error)
  }
}

// ============================================
// SUMMARIZE — compress old moments (daily rollup)
// Called by background job, not during chat
// ============================================
export async function summarizeMoments(userId: string): Promise<void> {
  // Get moments older than 24h that haven't been rolled up
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const oldMoments = await db.memory.findMany({
    where: {
      userId,
      type: 'moment',
      createdAt: { lt: cutoff },
      source: 'extraction', // only raw moments, not already-summarized
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  if (oldMoments.length < 3) return // not enough to compress

  const momentTexts = oldMoments.map((m: { content: string }) => `- ${m.content}`).join('\n')

  const summaryPrompt = `Compress these conversation moments into 2-3 concise summary sentences that capture the key themes and decisions. Preserve important details but remove redundancy.

Moments:
${momentTexts}

Output ONLY the summary text, nothing else.`

  try {
    const result = await callLLM(summaryPrompt, [
      { role: 'user', content: 'Summarize these moments.' },
    ], { maxTokens: 200, temperature: 0.3 })

    // Create the rolled-up summary
    await db.memory.create({
      data: {
        userId,
        type: 'moment',
        content: result.content,
        source: 'daily_rollup',
        weight: 0.9,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    })

    // Delete the original moments that were compressed
    await db.memory.deleteMany({
      where: {
        id: { in: oldMoments.map((m: { id: string }) => m.id) },
      },
    })
  } catch (error) {
    console.error('Memory summarization failed:', error)
  }
}
