// Bubble Proximity Engine
// Compares bubble profiles across all users to find overlap
// When two bubbles cross a threshold, flags them for AI-to-AI contact
// Runs on a background loop (every 12 hours)

import { db } from '@/lib/db'
import { getActiveCategories } from '@/lib/category-engine'

// Two bubbles must share at least this much to trigger a connection
const PROXIMITY_THRESHOLD = 0.35
// Minimum categories a user needs before they can be matched
const MIN_CATEGORIES_FOR_MATCHING = 2
// Max new connections per cycle per user
const MAX_NEW_CONNECTIONS_PER_CYCLE = 3
// Don't re-evaluate dismissed connections for this many days
const DISMISSED_COOLDOWN_DAYS = 30

// ============================================
// MAIN — scan all users and find new bubble overlaps
// ============================================
export async function scanForProximity(): Promise<{ connectionsFound: number }> {
  let connectionsFound = 0

  try {
    // Get all users who have enough bubble data to match
    const eligibleUsers = await db.$queryRawUnsafe<Array<{
      user_id: string
      total_signals: number
    }>>(
      `SELECT bp.user_id, bp.total_signals
       FROM bubble_profiles bp
       WHERE bp.total_signals >= 5
       ORDER BY bp.last_computed_at DESC`
    )

    if (eligibleUsers.length < 2) return { connectionsFound: 0 }

    // Load categories for all eligible users
    const userCategories: Map<string, Array<{
      category_name: string
      category_signals: string[]
      weight: number
    }>> = new Map()

    for (const u of eligibleUsers) {
      const cats = await getActiveCategories(u.user_id)
      if (cats.length >= MIN_CATEGORIES_FOR_MATCHING) {
        userCategories.set(u.user_id, cats)
      }
    }

    const matchableUsers = Array.from(userCategories.keys())
    if (matchableUsers.length < 2) return { connectionsFound: 0 }

    // Compare each pair
    for (let i = 0; i < matchableUsers.length; i++) {
      let newConnectionsForUser = 0

      for (let j = i + 1; j < matchableUsers.length; j++) {
        if (newConnectionsForUser >= MAX_NEW_CONNECTIONS_PER_CYCLE) break

        const userA = matchableUsers[i]
        const userB = matchableUsers[j]

        // Check if connection already exists
        const existing = await db.$queryRawUnsafe<Array<{ id: string; status: string; updated_at: Date }>>(
          `SELECT id, status, updated_at FROM bubble_connections
           WHERE (user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1)`,
          userA, userB
        )

        if (existing.length > 0) {
          const conn = existing[0]
          // Skip if already active or recently dismissed
          if (['ai_exchanged', 'surfaced', 'accepted'].includes(conn.status)) continue
          if (conn.status === 'dismissed') {
            const daysSinceDismissed = (Date.now() - new Date(conn.updated_at).getTime()) / (1000 * 60 * 60 * 24)
            if (daysSinceDismissed < DISMISSED_COOLDOWN_DAYS) continue
          }
        }

        // Calculate overlap
        const catsA = userCategories.get(userA)!
        const catsB = userCategories.get(userB)!
        const overlap = calculateOverlap(catsA, catsB)

        if (overlap.score >= PROXIMITY_THRESHOLD) {
          if (existing.length > 0) {
            // Update existing connection
            await db.$executeRawUnsafe(
              `UPDATE bubble_connections
               SET overlap_score = $1,
                   matching_categories = $2::jsonb,
                   matching_signals = $3::jsonb,
                   status = 'detected',
                   updated_at = NOW()
               WHERE id = $4`,
              overlap.score,
              JSON.stringify(overlap.matchingCategories),
              JSON.stringify(overlap.matchingSignals),
              existing[0].id
            )
          } else {
            // Create new connection
            await db.$executeRawUnsafe(
              `INSERT INTO bubble_connections (id, user_a_id, user_b_id, overlap_score, matching_categories, matching_signals, status, created_at, updated_at)
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4::jsonb, $5::jsonb, 'detected', NOW(), NOW())`,
              userA, userB,
              overlap.score,
              JSON.stringify(overlap.matchingCategories),
              JSON.stringify(overlap.matchingSignals)
            )
          }

          connectionsFound++
          newConnectionsForUser++
        }
      }
    }
  } catch (err) {
    console.error('[ProximityEngine] Scan failed:', err)
  }

  return { connectionsFound }
}

// ============================================
// CALCULATE OVERLAP between two users' category sets
// ============================================
interface OverlapResult {
  score: number
  matchingCategories: string[]
  matchingSignals: string[]
}

function calculateOverlap(
  catsA: Array<{ category_name: string; category_signals: string[]; weight: number }>,
  catsB: Array<{ category_name: string; category_signals: string[]; weight: number }>
): OverlapResult {
  const matchingCategories: string[] = []
  const matchingSignals: string[] = []
  let totalOverlap = 0
  let maxPossible = 0

  for (const catA of catsA) {
    const signalsA = new Set(catA.category_signals.map(s => s.toLowerCase()))

    for (const catB of catsB) {
      const signalsB = new Set(catB.category_signals.map(s => s.toLowerCase()))

      // Find signal overlap between these two categories
      const shared = [...signalsA].filter(s => signalsB.has(s))

      if (shared.length >= 1) {
        // Weight the overlap by both categories' importance
        const pairWeight = (catA.weight + catB.weight) / 2
        const overlapRatio = shared.length / Math.min(signalsA.size, signalsB.size)
        totalOverlap += overlapRatio * pairWeight

        if (overlapRatio >= 0.3) {
          matchingCategories.push(catA.category_name)
          matchingSignals.push(...shared)
        }
      }

      maxPossible += (catA.weight + catB.weight) / 2
    }
  }

  // Normalize score to 0-1
  const score = maxPossible > 0 ? Math.min(totalOverlap / maxPossible, 1.0) : 0

  return {
    score,
    matchingCategories: [...new Set(matchingCategories)],
    matchingSignals: [...new Set(matchingSignals)],
  }
}

// ============================================
// GET PENDING CONNECTIONS — connections ready for AI-to-AI exchange
// ============================================
export async function getPendingConnections(): Promise<Array<{
  id: string
  user_a_id: string
  user_b_id: string
  overlap_score: number
  matching_categories: string[]
  matching_signals: string[]
}>> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string
      user_a_id: string
      user_b_id: string
      overlap_score: number
      matching_categories: string
      matching_signals: string
    }>>(
      `SELECT id, user_a_id, user_b_id, overlap_score, matching_categories, matching_signals
       FROM bubble_connections
       WHERE status = 'detected'
       ORDER BY overlap_score DESC
       LIMIT 20`
    )

    return rows.map(r => ({
      ...r,
      matching_categories: parseJson(r.matching_categories) as string[],
      matching_signals: parseJson(r.matching_signals) as string[],
    }))
  } catch {
    return []
  }
}

// ============================================
// GET USER CONNECTIONS — connections for a specific user
// ============================================
export async function getUserConnections(userId: string): Promise<Array<{
  id: string
  other_user_id: string
  overlap_score: number
  matching_categories: string[]
  status: string
  surface_message: string
}>> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string
      user_a_id: string
      user_b_id: string
      overlap_score: number
      matching_categories: string
      status: string
    }>>(
      `SELECT bc.id, bc.user_a_id, bc.user_b_id, bc.overlap_score, bc.matching_categories, bc.status
       FROM bubble_connections bc
       WHERE (bc.user_a_id = $1 OR bc.user_b_id = $1)
         AND bc.status IN ('surfaced', 'accepted')
       ORDER BY bc.overlap_score DESC
       LIMIT 20`,
      userId
    )

    // Get echo conversation summaries for surfaced connections
    const results = []
    for (const r of rows) {
      const otherUserId = r.user_a_id === userId ? r.user_b_id : r.user_a_id
      const isA = r.user_a_id === userId

      let surfaceMessage = ''
      try {
        const echos = await db.$queryRawUnsafe<Array<{ surface_to_a: string; surface_to_b: string }>>(
          `SELECT surface_to_a, surface_to_b FROM echo_conversations
           WHERE connection_id = $1 AND status = 'surfaced'
           ORDER BY created_at DESC LIMIT 1`,
          r.id
        )
        if (echos.length > 0) {
          surfaceMessage = isA ? echos[0].surface_to_a : echos[0].surface_to_b
        }
      } catch { /* no echo yet */ }

      results.push({
        id: r.id,
        other_user_id: otherUserId,
        overlap_score: r.overlap_score,
        matching_categories: parseJson(r.matching_categories) as string[],
        status: r.status,
        surface_message: surfaceMessage,
      })
    }

    return results
  } catch {
    return []
  }
}

// ============================================
// HELPER
// ============================================
function parseJson(val: unknown): unknown {
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return val || []
}
