// Background Loops
// 4 loops that run on cron schedules (6-12h cycles):
// 1. Memory rollup — compress old moments
// 2. Feed generation — create new feed items
// 3. State update — evolve AI personality based on patterns
// 4. Notification generation — proactive pushes (max 2/day)

import { db } from './db'
import { callLLM } from './llm'
import { summarizeMoments, getMemoryContext } from './memory-engine'
import { generateFeedItems } from './feed-engine'
import { discoverSocialContent } from './social-engine'

// ============================================
// LOOP 1: MEMORY ROLLUP
// Schedule: every 12 hours
// Compresses old moments into summaries
// ============================================
export async function runMemoryRollup(): Promise<{ processed: number }> {
  const users = await db.user.findMany({ select: { id: true } })
  let processed = 0

  for (const user of users) {
    try {
      await summarizeMoments(user.id)
      processed++

      // Log the background event
      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'memory_rollup',
          status: 'completed',
          payload: JSON.stringify({ timestamp: new Date().toISOString() }),
        },
      })
    } catch (error) {
      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'memory_rollup',
          status: 'failed',
          payload: JSON.stringify({ error: String(error) }),
        },
      })
    }
  }

  return { processed }
}

// ============================================
// LOOP 2: FEED GENERATION
// Schedule: every 6 hours
// Creates new feed items for all users
// ============================================
export async function runFeedGeneration(): Promise<{ processed: number }> {
  const users = await db.user.findMany({ select: { id: true } })
  let processed = 0

  for (const user of users) {
    try {
      await generateFeedItems(user.id)

      // Also discover social content if Tavily is available
      let socialPicks = 0
      if (process.env.TAVILY_API_KEY) {
        try {
          socialPicks = await discoverSocialContent(user.id)
        } catch (err) {
          console.error(`[Social] Discovery failed for user ${user.id}:`, err)
        }
      }

      processed++

      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'feed_generation',
          status: 'completed',
          payload: JSON.stringify({ timestamp: new Date().toISOString(), socialPicks }),
        },
      })
    } catch (error) {
      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'feed_generation',
          status: 'failed',
          payload: JSON.stringify({ error: String(error) }),
        },
      })
    }
  }

  return { processed }
}

// ============================================
// LOOP 3: STATE UPDATE
// Schedule: every 12 hours
// Evolves AI personality based on interaction patterns
// ============================================
export async function runStateUpdate(): Promise<{ processed: number }> {
  const users = await db.user.findMany({
    select: { id: true },
  })
  let processed = 0

  for (const user of users) {
    try {
      // Get recent interactions to analyze
      const recentInteractions = await db.interaction.findMany({
        where: {
          userId: user.id,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      })

      // Not enough data to evolve
      if (recentInteractions.length < 3) continue

      const aiState = await db.aiState.findUnique({
        where: { userId: user.id },
      })
      if (!aiState) continue

      const memoryContext = await getMemoryContext(user.id)
      const currentTraits = JSON.parse(aiState.traits as string)

      const result = await callLLM(
        `You manage an AI's evolving personality state. Based on recent interaction patterns and what you know about the user, suggest subtle updates to the AI's traits.

Current traits: ${currentTraits.join(', ')}
Current tone: ${aiState.tone}
Recent interactions: ${recentInteractions.length} in last 24h (types: ${recentInteractions.map((i: { type: string }) => i.type).join(', ')})

Memory context:
${memoryContext}

Rules:
- Changes should be SUBTLE — one trait shift at a time max
- Traits evolve toward matching the user's communication style
- If user is consistently brief, AI becomes more concise
- If user engages deeply, AI becomes more exploratory
- Never lose core warmth
- Max 5 traits total

Output JSON only: {"traits": ["trait1", "trait2", ...], "tone": "warm|direct|playful|thoughtful"}`,
        [{ role: 'user', content: 'Suggest personality evolution.' }],
        { maxTokens: 150, temperature: 0.4 }
      )

      const updates = JSON.parse(result.content)

      await db.aiState.update({
        where: { userId: user.id },
        data: {
          traits: JSON.stringify(updates.traits || currentTraits),
          tone: updates.tone || aiState.tone,
        },
      })

      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'state_update',
          status: 'completed',
          payload: JSON.stringify({
            previousTraits: currentTraits,
            newTraits: updates.traits,
            tone: updates.tone,
          }),
        },
      })

      processed++
    } catch (error) {
      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'state_update',
          status: 'failed',
          payload: JSON.stringify({ error: String(error) }),
        },
      })
    }
  }

  return { processed }
}

// ============================================
// LOOP 4: SIGNAL INFERENCE
// Schedule: every 12 hours
// Detects behavioral patterns from interactions
// ============================================
export async function runSignalInference(): Promise<{ processed: number }> {
  const users = await db.user.findMany({ select: { id: true } })
  let processed = 0

  for (const user of users) {
    try {
      // Get last 7 days of interactions
      const interactions = await db.interaction.findMany({
        where: {
          userId: user.id,
          createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'asc' },
      })

      if (interactions.length < 5) continue

      // Analyze timing patterns
      const hours = interactions.map(
        (i: { createdAt: Date }) => new Date(i.createdAt).getHours()
      )
      const types = interactions.map((i: { type: string }) => i.type)

      // Simple pattern detection (no LLM needed)
      const morningCount = hours.filter((h: number) => h >= 6 && h < 12).length
      const eveningCount = hours.filter((h: number) => h >= 18 && h < 24).length
      const chatCount = types.filter((t: string) => t === 'chat').length

      const signals: string[] = []

      if (morningCount > interactions.length * 0.5) {
        signals.push('Tends to engage in the morning')
      }
      if (eveningCount > interactions.length * 0.5) {
        signals.push('Tends to engage in the evening')
      }
      if (chatCount > interactions.length * 0.7) {
        signals.push('Primary interaction mode is chat')
      }

      // Store new signals (avoid duplicates)
      for (const signal of signals) {
        const existing = await db.memory.findFirst({
          where: { userId: user.id, type: 'signal', content: signal },
        })
        if (!existing) {
          await db.memory.create({
            data: {
              userId: user.id,
              type: 'signal',
              content: signal,
              source: 'inference',
              weight: 0.6,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
        }
      }

      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'signal_inference',
          status: 'completed',
          payload: JSON.stringify({ signalsFound: signals.length }),
        },
      })

      processed++
    } catch (error) {
      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'signal_inference',
          status: 'failed',
          payload: JSON.stringify({ error: String(error) }),
        },
      })
    }
  }

  return { processed }
}
