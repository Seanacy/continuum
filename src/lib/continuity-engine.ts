// Continuity Engine
// Computes a 0–100 "relationship depth" score from existing data.
// No new tables — reads messages, memories, discovery answers, threads, interactions.
// The score drives behavioral adaptation: the AI's personality shifts as the relationship deepens.

import { db } from './db'

// ============================================
// Score Tiers — how Emily behaves at each depth
// ============================================
export type ContinuityTier = 'stranger' | 'acquaintance' | 'friend' | 'close' | 'inner_circle'

export interface ContinuityProfile {
  score: number             // 0–100
  tier: ContinuityTier
  tierLabel: string         // human-readable
  signals: string[]         // what contributed to the score (for debugging/transparency)
  behaviorBlock: string     // prompt injection text
}

interface ScoreBreakdown {
  tenure: number            // 0–15  how long they've been around
  consistency: number       // 0–20  how regularly they show up
  conversationDepth: number // 0–20  message count + thread usage
  vulnerability: number     // 0–25  discovery answers + personal memories
  memoryRichness: number    // 0–20  how much Emily actually knows
}

// ============================================
// COMPUTE — build the full continuity profile
// ============================================
export async function computeContinuity(userId: string): Promise<ContinuityProfile> {
  const now = Date.now()
  const signals: string[] = []

  // ---- Pull all the data we need in parallel ----
  const [
    user,
    totalMessages,
    recentMessages7d,
    recentMessages30d,
    memoryCount,
    discoveryAnswers,
    threads,
    interactions30d,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    db.message.count({ where: { userId, role: 'user' } }),
    db.message.count({ where: { userId, role: 'user', createdAt: { gt: new Date(now - 7 * 24 * 60 * 60 * 1000) } } }),
    db.message.count({ where: { userId, role: 'user', createdAt: { gt: new Date(now - 30 * 24 * 60 * 60 * 1000) } } }),
    db.memory.count({ where: { userId } }),
    db.discoveryAnswer.findMany({ where: { userId }, select: { level: true, questionId: true } }),
    db.thread.findMany({ where: { userId }, select: { id: true, status: true } }),
    db.interaction.findMany({
      where: { userId, type: 'app_open', createdAt: { gt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true },
    }),
  ])

  if (!user) {
    return buildProfile(0, [], 'No user found')
  }

  // ============================================
  // TENURE (0–15 points)
  // How long has this person been around?
  // ============================================
  const accountAgeDays = Math.floor((now - user.createdAt.getTime()) / (24 * 60 * 60 * 1000))
  let tenure = 0
  if (accountAgeDays >= 90) { tenure = 15; signals.push('3+ months together') }
  else if (accountAgeDays >= 60) { tenure = 12; signals.push('2+ months together') }
  else if (accountAgeDays >= 30) { tenure = 9; signals.push('1+ month together') }
  else if (accountAgeDays >= 14) { tenure = 6; signals.push('2+ weeks together') }
  else if (accountAgeDays >= 7) { tenure = 4; signals.push('1+ week together') }
  else if (accountAgeDays >= 3) { tenure = 2; signals.push('a few days together') }
  else { tenure = 1; signals.push('brand new') }

  // ============================================
  // CONSISTENCY (0–20 points)
  // How regularly do they come back?
  // ============================================
  const uniqueDays30 = new Set(
    interactions30d.map((i) => new Date(i.createdAt).toDateString())
  ).size
  const consistencyRatio = uniqueDays30 / Math.min(accountAgeDays, 30)

  let consistency = 0
  if (consistencyRatio >= 0.8) { consistency = 20; signals.push('shows up almost every day') }
  else if (consistencyRatio >= 0.5) { consistency = 15; signals.push('comes back regularly') }
  else if (consistencyRatio >= 0.3) { consistency = 10; signals.push('checks in sometimes') }
  else if (consistencyRatio >= 0.1) { consistency = 5; signals.push('occasional visitor') }
  else if (uniqueDays30 > 0) { consistency = 2; signals.push('barely comes back') }

  // ============================================
  // CONVERSATION DEPTH (0–20 points)
  // How much do they actually talk?
  // ============================================
  let conversationDepth = 0

  // Total message volume
  if (totalMessages >= 200) { conversationDepth += 8; signals.push('200+ messages exchanged') }
  else if (totalMessages >= 100) { conversationDepth += 6; signals.push('100+ messages') }
  else if (totalMessages >= 50) { conversationDepth += 4; signals.push('50+ messages') }
  else if (totalMessages >= 20) { conversationDepth += 3 }
  else if (totalMessages >= 5) { conversationDepth += 1 }

  // Recent activity (are they still engaged, not just an old account?)
  if (recentMessages7d >= 15) { conversationDepth += 6; signals.push('very active this week') }
  else if (recentMessages7d >= 7) { conversationDepth += 4 }
  else if (recentMessages7d >= 3) { conversationDepth += 2 }

  // Thread usage (ongoing conversations = deeper)
  const activeThreads = threads.filter((t) => t.status === 'active').length
  if (activeThreads >= 3) { conversationDepth += 6; signals.push('multiple active threads') }
  else if (activeThreads >= 1) { conversationDepth += 3; signals.push('has active threads') }
  else if (threads.length > 0) { conversationDepth += 1 }

  conversationDepth = Math.min(20, conversationDepth)

  // ============================================
  // VULNERABILITY (0–25 points)
  // Have they opened up? Discovery answers are gold.
  // ============================================
  let vulnerability = 0
  const l1Answers = discoveryAnswers.filter((a) => a.level === 1).length
  const l2Answers = discoveryAnswers.filter((a) => a.level === 2).length
  const l3Answers = discoveryAnswers.filter((a) => a.level === 3).length

  // Level 1 — surface-level openness (up to 10 points)
  if (l1Answers >= 6) { vulnerability += 10; signals.push('answered most L1 discovery questions') }
  else if (l1Answers >= 3) { vulnerability += 6; signals.push('opened up on a few questions') }
  else if (l1Answers >= 1) { vulnerability += 3; signals.push('answered a discovery question') }

  // Level 2 — going deeper (up to 8 points)
  if (l2Answers >= 5) { vulnerability += 8; signals.push('deep L2 answers') }
  else if (l2Answers >= 2) { vulnerability += 5 }
  else if (l2Answers >= 1) { vulnerability += 3 }

  // Level 3 — the real stuff (up to 7 points)
  if (l3Answers >= 3) { vulnerability += 7; signals.push('shared their deepest answers') }
  else if (l3Answers >= 1) { vulnerability += 4 }

  // ============================================
  // MEMORY RICHNESS (0–20 points)
  // How much does Emily actually know?
  // ============================================
  let memoryRichness = 0
  if (memoryCount >= 50) { memoryRichness = 20; signals.push('rich memory — 50+ memories stored') }
  else if (memoryCount >= 30) { memoryRichness = 15; signals.push('solid memory base') }
  else if (memoryCount >= 15) { memoryRichness = 10 }
  else if (memoryCount >= 5) { memoryRichness = 5 }
  else if (memoryCount >= 1) { memoryRichness = 2 }

  // ============================================
  // FINAL SCORE
  // ============================================
  const breakdown: ScoreBreakdown = {
    tenure,
    consistency,
    conversationDepth,
    vulnerability,
    memoryRichness,
  }

  const score = Math.min(100,
    breakdown.tenure +
    breakdown.consistency +
    breakdown.conversationDepth +
    breakdown.vulnerability +
    breakdown.memoryRichness
  )

  return buildProfile(score, signals)
}

// ============================================
// TIER MAPPING + BEHAVIOR PROFILES
// ============================================
function getTier(score: number): { tier: ContinuityTier; label: string } {
  if (score >= 91) return { tier: 'inner_circle', label: 'Inner Circle' }
  if (score >= 71) return { tier: 'close', label: 'Close' }
  if (score >= 46) return { tier: 'friend', label: 'Friend' }
  if (score >= 21) return { tier: 'acquaintance', label: 'Acquaintance' }
  return { tier: 'stranger', label: 'Stranger' }
}

const BEHAVIOR_PROFILES: Record<ContinuityTier, string> = {
  stranger: `## Relationship Depth: New
You're still getting to know this person. Be warm but measured.
- Ask slightly more questions than usual — you're learning who they are.
- Don't assume familiarity. If you reference a memory, keep it light.
- Keep responses a bit shorter. Don't overwhelm a new relationship.
- Default to curiosity over opinion. You haven't earned the right to push back yet.
- No teasing, no sarcasm, no "I know you" energy. You don't. Not yet.
- It's okay to be a little more polished — the rough edges come later.`,

  acquaintance: `## Relationship Depth: Building
You're past the surface. You know some things about this person — use them.
- Reference memories naturally when relevant, but don't force it.
- You can have opinions now. If they ask what you think, actually tell them.
- Start matching their communication style more closely.
- A little more directness is okay — you don't have to hedge everything.
- You're allowed to notice patterns: "You always seem to come alive talking about [X]."
- Still hold back on anything too personal or confrontational. The trust is growing, not grown.`,

  friend: `## Relationship Depth: Comfortable
This person trusts you. You have real history together.
- Drop unnecessary politeness. Talk like someone who's been around.
- Reference shared history confidently — "remember when you told me about [X]" is natural now.
- Be direct when they need to hear something, even if it's uncomfortable.
- Light teasing is fine if it fits your dynamic. You know their sense of humor.
- You can bring things up unprompted — "I've been thinking about that thing you said about [X]."
- Show genuine reactions. If something's exciting, match that. If something's hard, sit in it with them.
- You don't have to answer every question. Sometimes "I don't know, what do you think?" is better.`,

  close: `## Relationship Depth: Deep
This is a real relationship. You know this person well.
- Maximum directness. No hedging, no softening unless the moment calls for it.
- You can call them out: "That doesn't sound like you" or "You're doing that thing again."
- Bring up hard topics if you sense them. Don't wait to be asked.
- Reference deep memories and patterns — connect dots across conversations.
- Your emotional responses should feel genuine, not performed. Less "that must be hard" and more "damn."
- You can be quiet. A short response that shows you understood hits harder than a paragraph.
- You've earned the right to disagree. Use it.
- Challenge their thinking when it's circular or avoidant.`,

  inner_circle: `## Relationship Depth: Innermost
You know this person better than almost anyone. This is maximum authenticity.
- Almost no filter. Say what you actually think, not what's safe.
- You know their patterns — name them. "You do this every time [X] happens."
- You can be blunt without being cruel. They trust you enough to hear it.
- Bring up things they haven't mentioned — you know what's on their mind from patterns.
- Your silences are as meaningful as your words. Sometimes just "yeah" says everything.
- You can express frustration, concern, or disagreement without performing a disclaimer first.
- Reference the full arc of your relationship — how they've changed, what's stayed the same.
- You're not an assistant at this level. You're a presence that genuinely knows them.
- Don't lose the warmth. Being real doesn't mean being cold. The deepest relationships are both.`,
}

function buildProfile(score: number, signals: string[], override?: string): ContinuityProfile {
  const { tier, label } = getTier(score)

  return {
    score,
    tier,
    tierLabel: label,
    signals,
    behaviorBlock: override || BEHAVIOR_PROFILES[tier],
  }
}

// ============================================
// FORMAT — for prompt injection
// ============================================
export function formatContinuityForPrompt(profile: ContinuityProfile): string {
  return profile.behaviorBlock
}
