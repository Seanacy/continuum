// Bubble Tracker — Signal Tracking Engine
// Captures signals from user behavior and updates their bubble profile
// Signals come from: chat messages, feed interactions, discovery answers, engagement patterns
// Each signal strengthens over time with repetition

import { db } from './db'
import { callLLM } from './llm'

// ============================================
// TYPES
// ============================================
type SignalType = 'topic' | 'preference' | 'behavior' | 'goal' | 'mood' | 'timing'
type SignalSource = 'chat' | 'feed' | 'discovery' | 'interaction' | 'character_build'

interface ExtractedSignal {
  type: SignalType
  key: string
  value?: string
}

const DECAY_RATE = 0.95
const MAX_STRENGTH = 10.0
const STRENGTH_BOOST = 0.5

// ============================================
// MAIN — track a signal from any source
// ============================================
export async function trackSignal(
  userId: string,
  signalType: SignalType,
  signalKey: string,
  source: SignalSource,
  signalValue: string = ''
): Promise<void> {
  const normalizedKey = signalKey.toLowerCase().trim()
  if (!normalizedKey || normalizedKey.length < 2) return

  try {
    const existing = await db.$queryRawUnsafe<Array<{ id: string; strength: number; occurrence_count: number }>>(
      `SELECT id, strength, occurrence_count FROM bubble_signals
       WHERE user_id = $1 AND signal_type = $2 AND signal_key = $3`,
      userId, signalType, normalizedKey
    )

    if (existing.length > 0) {
      const newStrength = Math.min(existing[0].strength + STRENGTH_BOOST, MAX_STRENGTH)
      await db.$executeRawUnsafe(
        `UPDATE bubble_signals
         SET strength = $1, occurrence_count = occurrence_count + 1,
             signal_value = CASE WHEN $2 != '' THEN $2 ELSE signal_value END,
             source = $3, last_seen_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        newStrength, signalValue, source, existing[0].id
      )
    } else {
      await db.$executeRawUnsafe(
        `INSERT INTO bubble_signals (id, user_id, signal_type, signal_key, signal_value, strength, occurrence_count, source, last_seen_at, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 1.0, 1, $5, NOW(), NOW(), NOW())`,
        userId, signalType, normalizedKey, signalValue, source
      )
    }

    await ensureBubbleProfile(userId)
  } catch (err) {
    console.error('[BubbleTracker] Failed to track signal:', err)
  }
}

// ============================================
// EXTRACT SIGNALS FROM CHAT
// ============================================
export async function extractSignalsFromChat(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  if (userMessage.length < 10) return

  try {
    const result = await callLLM(
      `You are a signal extractor. Read this chat exchange and identify key signals about what this person cares about, wants, or is working on.

Signal types:
- topic: subjects they discuss (e.g. "cooking", "AI tools", "fitness")
- preference: things they like/dislike (e.g. "likes hip-hop", "prefers dark mode")
- goal: objectives or plans (e.g. "building a startup", "learning guitar")
- mood: emotional state (e.g. "excited", "stressed", "curious")

Rules:
- Only extract CLEAR signals — don't guess
- Max 5 signals per message
- Keep signal keys short (1-3 words)
- Skip small talk and pleasantries

User said: "${userMessage.slice(0, 500)}"
AI responded: "${aiResponse.slice(0, 300)}"

Output ONLY valid JSON array: [{"type": "topic|preference|goal|mood", "key": "signal_key", "value": "optional_detail"}]
If nothing meaningful, output: []`,
      [{ role: 'user', content: 'Extract signals.' }],
      { maxTokens: 200, temperature: 0.3 }
    )

    const signals: ExtractedSignal[] = JSON.parse(result.content.trim())
    if (!Array.isArray(signals)) return

    for (const signal of signals.slice(0, 5)) {
      if (signal.type && signal.key) {
        await trackSignal(userId, signal.type as SignalType, signal.key, 'chat', signal.value || '')
      }
    }
  } catch {
    // Silent fail — signal extraction is non-critical
  }
}

// ============================================
// TRACK FROM FEED INTERACTION
// ============================================
export async function trackFeedInteraction(
  userId: string,
  feedType: string,
  content: string
): Promise<void> {
  await trackSignal(userId, 'behavior', `engages_with_${feedType}`, 'feed')

  if (content.length > 20) {
    try {
      const result = await callLLM(
        `What is the main topic of this content in 1-3 words? Output ONLY the topic, nothing else.
Content: "${content.slice(0, 300)}"`,
        [{ role: 'user', content: 'Topic?' }],
        { maxTokens: 20, temperature: 0.1 }
      )
      const topic = result.content.trim().toLowerCase()
      if (topic.length > 1 && topic.length < 50) {
        await trackSignal(userId, 'topic', topic, 'feed')
      }
    } catch { /* Silent */ }
  }
}

// ============================================
// TRACK FROM CHARACTER BUILD — seed data
// ============================================
export async function trackFromCharacterBuild(userId: string, characterId: string): Promise<void> {
  try {
    const character = await db.character.findUnique({ where: { id: characterId } })
    if (!character) return

    const interests = character.interests as string[]
    if (Array.isArray(interests)) {
      for (const interest of interests) {
        await trackSignal(userId, 'topic', interest, 'character_build')
      }
    }

    if (character.nicheType) {
      await trackSignal(userId, 'topic', character.nicheType, 'character_build')
    }

    if (character.missionStatement) {
      await trackSignal(userId, 'goal', character.missionStatement.slice(0, 100), 'character_build')
    }

    const pillars = character.contentPillars as string[]
    if (Array.isArray(pillars)) {
      for (const pillar of pillars) {
        await trackSignal(userId, 'topic', pillar, 'character_build')
      }
    }
  } catch (err) {
    console.error('[BubbleTracker] Failed to track character build:', err)
  }
}

// ============================================
// TRACK TIMING PATTERNS
// ============================================
export async function trackTimingSignal(userId: string): Promise<void> {
  const hour = new Date().getHours()
  let timeSlot: string

  if (hour >= 5 && hour < 12) timeSlot = 'morning_user'
  else if (hour >= 12 && hour < 17) timeSlot = 'afternoon_user'
  else if (hour >= 17 && hour < 22) timeSlot = 'evening_user'
  else timeSlot = 'night_owl'

  await trackSignal(userId, 'timing', timeSlot, 'interaction')
}

// ============================================
// DECAY SIGNALS
// ============================================
export async function decaySignals(userId: string): Promise<number> {
  try {
    const result = await db.$executeRawUnsafe(
      `UPDATE bubble_signals
       SET strength = strength * $1, updated_at = NOW()
       WHERE user_id = $2
         AND last_seen_at < NOW() - INTERVAL '3 days'
         AND strength > 0.1`,
      DECAY_RATE, userId
    )

    await db.$executeRawUnsafe(
      `DELETE FROM bubble_signals WHERE user_id = $1 AND strength < 0.1`,
      userId
    )

    return typeof result === 'number' ? result : 0
  } catch {
    return 0
  }
}

// ============================================
// GET USER SIGNALS
// ============================================
export async function getUserSignals(userId: string): Promise<Array<{
  signal_type: string
  signal_key: string
  signal_value: string
  strength: number
  occurrence_count: number
}>> {
  try {
    return await db.$queryRawUnsafe(
      `SELECT signal_type, signal_key, signal_value, strength, occurrence_count
       FROM bubble_signals
       WHERE user_id = $1 AND strength >= 0.1
       ORDER BY strength DESC
       LIMIT 100`,
      userId
    )
  } catch {
    return []
  }
}

// ============================================
// ENSURE BUBBLE PROFILE EXISTS
// ============================================
async function ensureBubbleProfile(userId: string): Promise<void> {
  try {
    const existing = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM bubble_profiles WHERE user_id = $1`, userId
    )
    if (existing.length === 0) {
      await db.$executeRawUnsafe(
        `INSERT INTO bubble_profiles (id, user_id, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        userId
      )
    }
  } catch { /* Silent */ }
}

// ============================================
// RECOMPUTE BUBBLE PROFILE
// ============================================
export async function recomputeBubbleProfile(userId: string): Promise<void> {
  try {
    const signals = await getUserSignals(userId)
    if (signals.length === 0) return

    const summary: Record<string, Array<{ key: string; strength: number; count: number }>> = {}
    for (const s of signals) {
      if (!summary[s.signal_type]) summary[s.signal_type] = []
      summary[s.signal_type].push({
        key: s.signal_key,
        strength: s.strength,
        count: s.occurrence_count,
      })
    }

    const topSignals = signals.slice(0, 20)
    const maxStrength = Math.max(...topSignals.map(s => s.strength), 1)
    const vector = topSignals.map(s => ({
      key: `${s.signal_type}:${s.signal_key}`,
      weight: s.strength / maxStrength,
    }))

    await db.$executeRawUnsafe(
      `UPDATE bubble_profiles
       SET signal_summary = $1::jsonb,
           profile_vector = $2::jsonb,
           total_signals = $3,
           last_computed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $4`,
      JSON.stringify(summary),
      JSON.stringify(vector),
      signals.length,
      userId
    )
  } catch (err) {
    console.error('[BubbleTracker] Failed to recompute profile:', err)
  }
}
