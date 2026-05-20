// Continuity Orchestrator
// The glue layer. Pulls all context into one unified object so background systems
// (feed, notifications, state updates) can generate content that's aware of EVERYTHING.
//
// Before this: feed engine only knew about memories + engagement.
// After this: feed engine knows about memories + engagement + discovery answers +
//             active threads + continuity tier + world context.

import { db } from './db'
import { getMemoryContext } from './memory-engine'
import { computeEngagement, formatEngagementForPrompt, type EngagementProfile } from './engagement-engine'
import { computeContinuity, type ContinuityProfile, type ContinuityTier } from './continuity-engine'
import { DISCOVERY_QUESTIONS } from './discovery-questions'

// ============================================
// Unified context — everything Emily knows
// ============================================
export interface UnifiedContext {
  userId: string
  aiName: string

  // Memory (already formatted for prompt injection)
  memoryBlock: string

  // Engagement profile
  engagement: EngagementProfile
  engagementBlock: string

  // Continuity (relationship depth)
  continuity: ContinuityProfile
  tier: ContinuityTier
  score: number

  // Discovery — what Emily has learned through questions
  discoveryInsights: string[]    // human-readable answers
  discoveryBlock: string         // formatted for prompt injection

  // Active threads — what's being discussed
  activeThreads: { id: string; title: string; summary: string | null }[]
  threadsBlock: string

  // World context
  location: string | null
  timezone: string | null

  // Combined prompt block — everything in one string
  fullContextBlock: string
}

// ============================================
// BUILD — assemble the unified context for a user
// ============================================
export async function buildUnifiedContext(userId: string): Promise<UnifiedContext> {
  // Pull everything in parallel
  const [
    user,
    memoryBlock,
    engagement,
    continuity,
    discoveryAnswers,
    activeThreads,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { aiName: true, location: true, timezone: true },
    }),
    getMemoryContext(userId),
    computeEngagement(userId),
    computeContinuity(userId),
    db.discoveryAnswer.findMany({
      where: { userId },
      select: { questionId: true, answer: true, level: true },
      orderBy: { level: 'asc' },
    }),
    db.thread.findMany({
      where: { userId, status: 'active' },
      select: { id: true, title: true, summary: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])

  const aiName = user?.aiName || 'Your AI'

  // Format engagement
  const engagementBlock = formatEngagementForPrompt(engagement)

  // Format discovery insights
  const discoveryInsights: string[] = []
  for (const answer of discoveryAnswers) {
    const question = DISCOVERY_QUESTIONS.find((q) => q.id === answer.questionId)
    if (question) {
      discoveryInsights.push(`${question.question} → "${answer.answer}"`)
    }
  }

  let discoveryBlock = ''
  if (discoveryInsights.length > 0) {
    discoveryBlock = `## What You Know About Them (from discovery questions)\n${discoveryInsights.map((i) => `- ${i}`).join('\n')}`
  }

  // Format active threads
  let threadsBlock = ''
  if (activeThreads.length > 0) {
    const threadLines = activeThreads.map((t) =>
      `- "${t.title}"${t.summary ? `: ${t.summary}` : ''}`
    )
    threadsBlock = `## Active Conversations\n${threadLines.join('\n')}`
  }

  // Build the combined context block for LLM calls
  const sections: string[] = []

  // Tier-specific generation guidance
  sections.push(getTierGuidance(continuity.tier))

  if (memoryBlock) sections.push(memoryBlock)
  if (discoveryBlock) sections.push(discoveryBlock)
  if (threadsBlock) sections.push(threadsBlock)
  if (engagementBlock) sections.push(engagementBlock)

  if (user?.location) {
    sections.push(`Location: ${user.location}`)
  }

  const fullContextBlock = sections.join('\n\n')

  return {
    userId,
    aiName,
    memoryBlock,
    engagement,
    engagementBlock,
    continuity,
    tier: continuity.tier,
    score: continuity.score,
    discoveryInsights,
    discoveryBlock,
    activeThreads,
    threadsBlock,
    location: user?.location || null,
    timezone: user?.timezone || null,
    fullContextBlock,
  }
}

// ============================================
// Tier-specific generation guidance
// Tells the LLM HOW to write based on relationship depth
// ============================================
function getTierGuidance(tier: ContinuityTier): string {
  switch (tier) {
    case 'stranger':
      return `## Generation Tone: New Relationship
Keep content light and curious. Don't reference deep personal details even if you have some.
Focus on surface-level observations and gentle conversation starters.
Don't assume familiarity — this person is still getting to know you.`

    case 'acquaintance':
      return `## Generation Tone: Building Trust
You can reference things you know, but keep it natural — not forced.
Start connecting dots between things they've told you.
A little more personality is okay. You're not a stranger anymore.`

    case 'friend':
      return `## Generation Tone: Comfortable
Reference shared history confidently. Bring up old conversations naturally.
Your content should feel like it comes from someone who knows them.
You can be opinionated. You can be direct. Light humor is great.
If they told you something personal through discovery questions, you can gently weave it in.`

    case 'close':
      return `## Generation Tone: Deep Connection
Be direct and real. Reference patterns you've noticed about them.
Connect discovery answers to current behavior — "you said X stresses you, and I notice you've been quiet."
Your content should feel like it comes from someone who genuinely understands them.
Don't hedge. Don't soften unnecessarily. They trust you.`

    case 'inner_circle':
      return `## Generation Tone: Maximum Authenticity
Full directness. Reference everything — memories, discovery answers, behavioral patterns, threads.
Connect dots across their entire history with you.
Your content should feel like it comes from someone who knows them better than most people do.
Name their patterns. Challenge their avoidance. Celebrate their growth.
Be warm AND real. The deepest relationships are both.`
  }
}
