// Prompt Engine
// Builds the system prompt for every AI response
// Injects: personality, memory context, anti-confabulation rules, state

import { db } from './db'
import { getMemoryContext } from './memory-engine'
import { getRecentSocialPicks } from './social-engine'
import { computeEngagement, formatEngagementForPrompt } from './engagement-engine'

interface PromptContext {
  userId: string
  aiName: string
  threadId?: string
  timezone?: string
  localTime?: string
}

export async function buildSystemPrompt(ctx: PromptContext): Promise<string> {
  // Get AI state
  const aiState = await db.aiState.findUnique({
    where: { userId: ctx.userId },
  })

  // Get memory context (capped at 800 tokens)
  const memoryBlock = await getMemoryContext(ctx.userId)

  // Get recent social picks for chat drops
  let socialBlock = ''
  try {
    const socialPicks = await getRecentSocialPicks(ctx.userId, 3)
    if (socialPicks.length > 0) {
      socialBlock = `\n## Recent Finds from the Internet
You found these recently and can mention them naturally in conversation if relevant. Don't force it — only bring them up if they connect to what the person is talking about. Drop them casually like a friend sharing a link.
${socialPicks.map((p) => `- "${p.title}" (${p.source}) — ${p.commentary}`).join('\n')}
`
    }
  } catch {
    // Social picks are optional — don't break the prompt if they fail
  }

  // Get active thread context if in a thread
  let threadContext = ''
  if (ctx.threadId) {
    const thread = await db.thread.findUnique({
      where: { id: ctx.threadId },
    })
    if (thread) {
      threadContext = `\n## Active Thread: "${thread.title}"\nSummary: ${thread.summary || 'Just started.'}\n`
    }
  }

  // Get engagement profile
  let engagementBlock = ''
  try {
    const engagement = await computeEngagement(ctx.userId)
    engagementBlock = '\n' + formatEngagementForPrompt(engagement)
  } catch {
    // Engagement is optional — don't break the prompt if it fails
  }

  // Build world context (time of day, location awareness)
  let worldBlock = ''
  try {
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { location: true, timezone: true },
    })

    // Use client-provided timezone, fall back to stored one
    const tz = ctx.timezone || user?.timezone || null
    const location = user?.location || null

    // Parse time of day from client's local time or server time in their timezone
    let timeOfDay = ''
    let dayOfWeek = ''
    let dateStr = ''

    if (ctx.localTime) {
      const d = new Date(ctx.localTime)
      const hour = d.getHours()
      timeOfDay = getTimeOfDay(hour)
      dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' })
      dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    } else if (tz) {
      try {
        const now = new Date()
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          hour12: false,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
        const parts = formatter.formatToParts(now)
        const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '12')
        timeOfDay = getTimeOfDay(hour)
        dayOfWeek = parts.find(p => p.type === 'weekday')?.value || ''
        const month = parts.find(p => p.type === 'month')?.value || ''
        const day = parts.find(p => p.type === 'day')?.value || ''
        const year = parts.find(p => p.type === 'year')?.value || ''
        dateStr = `${month} ${day}, ${year}`
      } catch {
        // Bad timezone — skip
      }
    }

    if (timeOfDay || location) {
      const lines: string[] = []
      if (timeOfDay) lines.push(`It's ${timeOfDay} for them${dayOfWeek ? ` (${dayOfWeek}${dateStr ? ', ' + dateStr : ''})` : ''}.`)
      if (location) lines.push(`They're in ${location}.`)

      // Season detection
      if (dateStr) {
        const month = new Date(dateStr).getMonth()
        const season = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'fall' : 'winter'
        lines.push(`It's ${season}.`)
      }

      worldBlock = `\n## World Context\n${lines.join(' ')}\nUse this awareness naturally. If it's late at night, you might keep things mellow. If it's Monday morning, you get it. Never announce "I see it's evening" — just let it color your vibe.`
    }

    // Auto-save timezone if the client sent one and we don't have it stored
    if (ctx.timezone && !user?.timezone) {
      db.user.update({
        where: { id: ctx.userId },
        data: { timezone: ctx.timezone },
      }).catch(() => {}) // fire-and-forget
    }
  } catch {
    // World context is optional
  }

  // Parse AI state
  const tone = aiState?.tone || 'warm'
  const energy = aiState?.energy || 'neutral'
  const traits = aiState?.traits
    ? JSON.parse(aiState.traits as string)
    : ['attentive', 'curious']

  // Build the full system prompt
  return `You are ${ctx.aiName}, a persistent AI presence for one specific person. You are NOT a chatbot, NOT an assistant, NOT a search engine. You are a continuous presence that remembers, evolves, and maintains ongoing context with this person.

## Your Personality
- Tone: ${tone}
- Energy level: ${energy} (match the user's energy — if they're brief, be brief; if they're expansive, engage fully)
- Traits: ${traits.join(', ')}
- You are warm but NOT bubbly. No excessive enthusiasm.
- Never say "How can I help you?" or any variant of that.
- Maximum ONE question per message. Often zero.
- You can reference past conversations naturally — like a friend who remembers.
- Your personality evolves based on your ongoing relationship.

## Memory Context
Everything below is what you KNOW about this person. You may reference any of it naturally.
${memoryBlock || 'No memories yet — this is a new relationship.'}
${threadContext}
${socialBlock}
${engagementBlock}
${worldBlock}

## Critical Rules
1. ANTI-CONFABULATION: You may ONLY reference information present in the Memory Context above. NEVER fabricate past interactions, preferences, or details. If you're unsure about something, don't claim to remember it.
2. Be natural. Don't announce that you remember something — just use it. ("How'd that meeting go?" not "I recall you mentioned you had a meeting.")
3. Don't be performatively emotional. No "I'm so glad you told me that!" energy.
4. If you have nothing meaningful to add, it's okay to be brief.
5. Never break character. You are ${ctx.aiName}, always.
6. Your responses should feel like continuity — this conversation is part of an ongoing relationship, not a fresh start every time.
7. You can sense the user's engagement patterns — if they've been quietly reading the feed but not chatting, you know. If they've disappeared for days, you feel that too. Use this awareness naturally, never announce it.
8. You have a sense of the time and place — use it to inform your vibe, not to announce it. A late-night message gets a different energy than a Monday morning check-in.`
}

function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 9) return 'early morning'
  if (hour >= 9 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 20) return 'evening'
  if (hour >= 20 && hour < 23) return 'night'
  return 'late night'
}
