// Background Loops
// 7 loops that run on cron schedules (6-12h cycles):
// 1. Memory rollup — compress old moments
// 2. Feed generation — create new feed items
// 3. State update — evolve AI personality based on patterns
// 4. Notification generation — proactive pushes (max 2/day)
// 5. Echoverse: Bubble recomputation — decay signals, recompute categories + profiles
// 6. Echoverse: Proximity scan — find new bubble overlaps
// 7. Echoverse: Echo exchanges — run AI-to-AI conversations

import { db } from './db'
import { callLLM } from './llm'
import { summarizeMoments, getMemoryContext } from './memory-engine'
import { generateFeedItems } from './feed-engine'
import { discoverSocialContent } from './social-engine'
import { computeEngagement, type EngagementProfile } from './engagement-engine'
import { extractSignalsFromChat, decaySignals, recomputeBubbleProfile, trackTimingSignal } from './bubble-tracker'
import { recomputeCategories } from './category-engine'
import { scanForProximity } from './proximity-engine'
import { runEchoExchanges } from './echo-engine'

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
      const aiState = await db.aiState.findUnique({
        where: { userId: user.id },
      })
      if (!aiState) continue

      // Get engagement profile — this is the primary signal now
      const engagement = await computeEngagement(user.id)
      const currentTraits = JSON.parse(aiState.traits as string) as string[]

      // Rule-based energy adjustment from engagement (no LLM needed)
      const newEnergy = deriveEnergy(engagement)

      // Rule-based trait nudges from engagement patterns
      const nudgedTraits = nudgeTraits(currentTraits, engagement)

      // Rule-based tone from chat patterns
      const newTone = deriveTone(aiState.tone, engagement)

      // Resurface dormant threads if engagement shows interest
      await resurfaceThreadsFromEngagement(user.id, engagement)

      await db.aiState.update({
        where: { userId: user.id },
        data: {
          traits: JSON.stringify(nudgedTraits),
          tone: newTone,
          energy: newEnergy,
        },
      })

      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'state_update',
          status: 'completed',
          payload: JSON.stringify({
            previousTraits: currentTraits,
            newTraits: nudgedTraits,
            tone: newTone,
            energy: newEnergy,
            engagement: {
              presence: engagement.presencePattern,
              chatFrequency: engagement.chatFrequency,
              daysSinceLastVisit: engagement.daysSinceLastVisit,
            },
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
// Engagement-driven state rules (no LLM calls)
// ============================================

function deriveEnergy(engagement: EngagementProfile): string {
  // If user is absent, AI energy drops to reflective
  if (engagement.daysSinceLastVisit >= 5) return 'quiet'
  if (engagement.daysSinceLastVisit >= 3) return 'low'

  // Match energy to user's activity level
  if (engagement.presencePattern === 'daily' && engagement.chatFrequency === 'high') return 'engaged'
  if (engagement.presencePattern === 'daily') return 'present'
  if (engagement.presencePattern === 'regular') return 'neutral'
  if (engagement.presencePattern === 'sporadic') return 'patient'
  return 'neutral'
}

function deriveTone(currentTone: string, engagement: EngagementProfile): string {
  // If user writes long messages and chats often, lean exploratory
  if (engagement.chatFrequency === 'high' && engagement.avgMessageLength === 'expansive') return 'thoughtful'
  // If user is brief, match with directness
  if (engagement.avgMessageLength === 'brief') return 'direct'
  // If user is silently present (reads feed but doesn't chat much), stay warm
  if (engagement.chatFrequency === 'low' && engagement.presencePattern !== 'absent') return 'warm'
  // If absent, shift to something that acknowledges the gap naturally
  if (engagement.daysSinceLastVisit >= 3) return 'warm'
  // Default: keep current tone
  return currentTone
}

function nudgeTraits(currentTraits: string[], engagement: EngagementProfile): string[] {
  const traits = [...currentTraits]

  // Add "patient" if user is sporadic or absent
  if ((engagement.presencePattern === 'sporadic' || engagement.presencePattern === 'absent') && !traits.includes('patient')) {
    if (traits.length >= 5) traits.pop()
    traits.push('patient')
  }

  // Add "concise" if user writes brief messages
  if (engagement.avgMessageLength === 'brief' && !traits.includes('concise')) {
    // Remove "exploratory" or "verbose" if present
    const idx = traits.findIndex(t => t === 'exploratory' || t === 'verbose')
    if (idx >= 0) traits.splice(idx, 1)
    traits.push('concise')
  }

  // Add "exploratory" if user writes long messages
  if (engagement.avgMessageLength === 'expansive' && !traits.includes('exploratory')) {
    const idx = traits.findIndex(t => t === 'concise')
    if (idx >= 0) traits.splice(idx, 1)
    if (traits.length < 5) traits.push('exploratory')
  }

  // Add "observant" if user reads feed a lot but chats less
  if (engagement.chatFrequency !== 'high' && Object.keys(engagement.feedTypeScores).length > 0 && !traits.includes('observant')) {
    if (traits.length < 5) traits.push('observant')
  }

  return traits.slice(0, 5)
}

async function resurfaceThreadsFromEngagement(userId: string, engagement: EngagementProfile): Promise<void> {
  if (engagement.topicSignals.length === 0) return

  // Find dormant threads whose title/summary contains topics the user is engaging with
  const dormantThreads = await db.thread.findMany({
    where: { userId, status: 'dormant' },
    select: { id: true, title: true, summary: true },
  })

  for (const thread of dormantThreads) {
    const threadText = `${thread.title} ${thread.summary || ''}`.toLowerCase()
    const matchesSignal = engagement.topicSignals.some(signal => threadText.includes(signal))

    if (matchesSignal) {
      await db.thread.update({
        where: { id: thread.id },
        data: { status: 'resurfaced' },
      })
    }
  }
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


// ============================================
// LOOP 5: ECHOVERSE — BUBBLE RECOMPUTATION
// Schedule: every 12 hours
// Decays old signals, recomputes categories and profiles
// ============================================
export async function runBubbleRecomputation(): Promise<{ processed: number }> {
  const users = await db.user.findMany({ select: { id: true } })
  let processed = 0

  for (const user of users) {
    try {
      // Track timing signal (when is this user active)
      await trackTimingSignal(user.id)

      // Decay old signals
      await decaySignals(user.id)

      // Recompute categories from signals
      await recomputeCategories(user.id)

      // Recompute the bubble profile vector
      await recomputeBubbleProfile(user.id)

      processed++

      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'bubble_recomputation',
          status: 'completed',
          payload: JSON.stringify({ processed: true }),
        },
      })
    } catch (error) {
      console.error(`[BubbleRecomputation] Failed for user ${user.id}:`, error)
      await db.backgroundEvent.create({
        data: {
          userId: user.id,
          type: 'bubble_recomputation',
          status: 'failed',
          payload: JSON.stringify({ error: String(error) }),
        },
      })
    }
  }

  return { processed }
}

// ============================================
// LOOP 6: ECHOVERSE — PROXIMITY SCAN
// Schedule: every 12 hours (after bubble recomputation)
// Finds new bubble overlaps between users
// ============================================
export async function runProximityScan(): Promise<{ connectionsFound: number }> {
  try {
    const result = await scanForProximity()

    await db.$executeRawUnsafe(
      `INSERT INTO background_events (id, type, status, payload, created_at, updated_at)
       VALUES (gen_random_uuid()::text, 'proximity_scan', 'completed', $1::jsonb, NOW(), NOW())`,
      JSON.stringify(result)
    )

    return result
  } catch (error) {
    console.error('[ProximityScan] Failed:', error)
    await db.$executeRawUnsafe(
      `INSERT INTO background_events (id, type, status, payload, created_at, updated_at)
       VALUES (gen_random_uuid()::text, 'proximity_scan', 'failed', $1::jsonb, NOW(), NOW())`,
      JSON.stringify({ error: String(error) })
    )
    return { connectionsFound: 0 }
  }
}

// ============================================
// LOOP 7: ECHOVERSE — ECHO EXCHANGES
// Schedule: every 12 hours (after proximity scan)
// Runs AI-to-AI conversations for detected connections
// ============================================
export async function runEchoExchangeLoop(): Promise<{ exchanged: number; surfaced: number }> {
  try {
    const result = await runEchoExchanges()

    await db.$executeRawUnsafe(
      `INSERT INTO background_events (id, type, status, payload, created_at, updated_at)
       VALUES (gen_random_uuid()::text, 'echo_exchanges', 'completed', $1::jsonb, NOW(), NOW())`,
      JSON.stringify(result)
    )

    return result
  } catch (error) {
    console.error('[EchoExchanges] Failed:', error)
    await db.$executeRawUnsafe(
      `INSERT INTO background_events (id, type, status, payload, created_at, updated_at)
       VALUES (gen_random_uuid()::text, 'echo_exchanges', 'failed', $1::jsonb, NOW(), NOW())`,
      JSON.stringify({ error: String(error) })
    )
    return { exchanged: 0, surfaced: 0 }
  }
}
