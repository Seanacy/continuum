// Category Emergence Engine
// Clusters signals into dynamic categories that emerge from patterns
// No hardcoded category list — categories are born, grow, merge, and fade
// Runs on a background loop (every 12 hours)

import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'
import { getUserSignals } from '@/lib/bubble-tracker'

const MIN_SIGNALS_FOR_CATEGORY = 3 // need at least 3 related signals to form a category
const MAX_CATEGORIES_PER_USER = 15
const FADE_THRESHOLD = 0.3 // categories below this weight start fading

// ============================================
// MAIN — recompute categories for a user
// ============================================
export async function recomputeCategories(userId: string): Promise<number> {
  const signals = await getUserSignals(userId)
  if (signals.length < MIN_SIGNALS_FOR_CATEGORY) return 0

  try {
    // Step 1: Have AI cluster the signals into categories
    const clusters = await clusterSignals(signals)
    if (clusters.length === 0) return 0

    // Step 2: Get existing categories
    const existing = await db.$queryRawUnsafe<Array<{
      id: string
      category_name: string
      category_signals: string
      weight: number
      status: string
    }>>(
      `SELECT id, category_name, category_signals, weight, status
       FROM bubble_categories
       WHERE user_id = $1`,
      userId
    )

    // Step 3: Match new clusters to existing categories or create new ones
    let updated = 0
    const matchedExistingIds = new Set<string>()

    for (const cluster of clusters.slice(0, MAX_CATEGORIES_PER_USER)) {
      // Try to find an existing category that matches
      const match = existing.find(e => {
        const existingSignals = parseJson(e.category_signals) as string[]
        const overlap = cluster.signals.filter((s: string) => existingSignals.includes(s))
        return overlap.length >= Math.min(2, cluster.signals.length * 0.5) ||
               e.category_name.toLowerCase() === cluster.name.toLowerCase()
      })

      if (match) {
        // Update existing category
        matchedExistingIds.add(match.id)
        const mergedSignals = Array.from(new Set([
          ...(parseJson(match.category_signals) as string[]),
          ...cluster.signals,
        ]))

        await db.$executeRawUnsafe(
          `UPDATE bubble_categories
           SET category_name = $1,
               category_signals = $2::jsonb,
               weight = $3,
               status = 'active',
               updated_at = NOW()
           WHERE id = $4`,
          cluster.name,
          JSON.stringify(mergedSignals),
          cluster.weight,
          match.id
        )
        updated++
      } else {
        // Create new category
        await db.$executeRawUnsafe(
          `INSERT INTO bubble_categories (id, user_id, category_name, category_signals, weight, status, created_at, updated_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3::jsonb, $4, 'emerging', NOW(), NOW())`,
          userId,
          cluster.name,
          JSON.stringify(cluster.signals),
          cluster.weight
        )
        updated++
      }
    }

    // Step 4: Fade unmatched existing categories
    for (const e of existing) {
      if (!matchedExistingIds.has(e.id) && e.status === 'active') {
        const newWeight = e.weight * 0.7
        if (newWeight < FADE_THRESHOLD) {
          await db.$executeRawUnsafe(
            `UPDATE bubble_categories SET status = 'fading', weight = $1, updated_at = NOW() WHERE id = $2`,
            newWeight, e.id
          )
        } else {
          await db.$executeRawUnsafe(
            `UPDATE bubble_categories SET weight = $1, updated_at = NOW() WHERE id = $2`,
            newWeight, e.id
          )
        }
      }
    }

    // Step 5: Retire categories that have been fading too long
    await db.$executeRawUnsafe(
      `UPDATE bubble_categories
       SET status = 'retired'
       WHERE user_id = $1 AND status = 'fading' AND weight < 0.1`,
      userId
    )

    return updated
  } catch (err) {
    console.error('[CategoryEngine] Failed to recompute categories:', err)
    return 0
  }
}

// ============================================
// CLUSTER SIGNALS — AI groups signals into natural categories
// ============================================
async function clusterSignals(
  signals: Array<{ signal_type: string; signal_key: string; strength: number; occurrence_count: number }>
): Promise<Array<{ name: string; signals: string[]; weight: number }>> {
  const signalList = signals
    .map(s => `${s.signal_type}:${s.signal_key} (strength: ${s.strength.toFixed(1)}, seen ${s.occurrence_count}x)`)
    .join('\n')

  try {
    const result = await callLLM(
      `You are a pattern recognizer. Group these user signals into natural categories. Categories should describe what this person is INTO — not generic labels.

Rules:
- Each category needs a short, specific name (2-4 words). Example: "music production", "AI & startups", "cooking & health" — NOT "interests" or "activities"
- A category must have at least 2 signals
- A signal can only belong to one category
- Weight = average strength of signals in that category, normalized to 0-1
- Max 10 categories
- Skip signals that don't cluster naturally

Signals:
${signalList}

Output ONLY valid JSON array: [{"name": "category name", "signals": ["signal_key1", "signal_key2"], "weight": 0.8}]
If no clear clusters, output: []`,
      [{ role: 'user', content: 'Cluster these signals.' }],
      { maxTokens: 500, temperature: 0.3 }
    )

    const clusters = JSON.parse(result.content.trim())
    if (!Array.isArray(clusters)) return []
    return clusters.filter(
      (c: { name: string; signals: string[]; weight: number }) =>
        c.name && Array.isArray(c.signals) && c.signals.length >= 2
    )
  } catch {
    return []
  }
}

// ============================================
// GET ACTIVE CATEGORIES — for proximity comparison and display
// ============================================
export async function getActiveCategories(userId: string): Promise<Array<{
  id: string
  category_name: string
  category_signals: string[]
  weight: number
  status: string
}>> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string
      category_name: string
      category_signals: string
      weight: number
      status: string
    }>>(
      `SELECT id, category_name, category_signals, weight, status
       FROM bubble_categories
       WHERE user_id = $1 AND status IN ('active', 'emerging')
       ORDER BY weight DESC
       LIMIT $2`,
      userId, MAX_CATEGORIES_PER_USER
    )

    return rows.map(r => ({
      ...r,
      category_signals: parseJson(r.category_signals) as string[],
    }))
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
