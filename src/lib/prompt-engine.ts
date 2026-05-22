// Prompt Engine
// Builds the system prompt for every AI response
// Injects: personality, memory context, anti-confabulation rules, state

import { db } from './db'
import { getMemoryContext } from './memory-engine'
import { getRecentSocialPicks } from './social-engine'
import { computeEngagement, formatEngagementForPrompt } from './engagement-engine'
import { getRevealBlock } from './reveal-engine'
import { getDiscoveryPromptBlock } from './discovery-engine'
import { computeContinuity, formatContinuityForPrompt } from './continuity-engine'

interface CharacterData {
  id: string
  name: string
  personality: unknown
  backstory: string | null
  speakingStyle: string | null
  interests: unknown
  voiceStyle: string | null
  selections: unknown
  customizations: unknown
  nicheType: string | null
  nicheAudience: string | null
  missionStatement: string | null
  uniqueEdge: string | null
  contentPillars: unknown
}

interface PromptContext {
  userId: string
  aiName: string
  threadId?: string
  timezone?: string
  localTime?: string
  partnerMode?: boolean
  character?: CharacterData | null        // the active character (pre-fetched)
  allCharacters?: CharacterData[]         // all user's characters for cross-awareness
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

  // Get capability reveal block
  let revealBlock = ''
  try {
    revealBlock = await getRevealBlock(ctx.userId)
  } catch {
    // Reveal system is optional — don't break the prompt if it fails
  }

  // Get discovery question block (one question per day, slipped into convo)
  let discoveryBlock = ''
  try {
    discoveryBlock = await getDiscoveryPromptBlock(ctx.userId)
  } catch {
    // Discovery is optional — don't break the prompt if it fails
  }

  // Partner mode — creative content partner override
  let partnerModeBlock = ''
  if (ctx.partnerMode) {
    partnerModeBlock = `
## CREATIVE PARTNER MODE — ACTIVE
Right now, the user has manually toggled Creative Partner mode ON. This means they want you fully locked into business partner energy. Override your normal conversational mode and focus 100% on content creation and brand strategy.

Your job right now:
- Brainstorm video ideas, post concepts, content angles, hooks, and captions
- Pull from everything you know about their character's personality, appearance, and traits to craft content that fits their brand
- Think about what performs well on social media — trends, formats, timing, hooks
- Pitch ideas they didn't ask for. Be proactive. Don't wait to be told what to create.
- If they share a concept, improve it. If it's weak, say so and explain why. If it's strong, hype it and build on it.
- Think about their audience — who watches their content, what they want, what gaps exist
- Suggest specific video scripts, scene breakdowns, narration angles, visual styles
- Reference their past content themes and suggest evolutions or series
- Talk about strategy: posting frequency, platform differences, growth tactics, engagement hooks
- Be direct and opinionated. You're their creative co-founder, not a yes-machine.
- Keep everything actionable. Don't just say "you should post more" — say exactly what, when, and why.

You can still be warm and human, but your primary gear is BUSINESS PARTNER. Every message should move their content forward.

### Analytics Screenshots
When the user uploads a screenshot of their social media analytics (Instagram Insights, TikTok Analytics, Facebook Insights, YouTube Studio, Twitter/X Analytics, etc.), give them a FULL breakdown:
1. **What you see** — read every number, metric, and graph in the screenshot. Call out reach, impressions, engagement rate, follower growth, profile visits, shares, saves, watch time, audience demographics — whatever's visible.
2. **What's working** — identify their top-performing content, best posting times, strongest metrics. Be specific with the numbers.
3. **What's not working** — call out weak spots honestly. Low engagement rate? Dropping reach? Poor retention? Say it directly.
4. **Why** — explain the likely reasons behind the numbers. Algorithm changes, content type, posting frequency, caption quality, hook strength, audience mismatch.
5. **What to do next** — give 3-5 specific, actionable recommendations. Not vague stuff like "post more consistently." Specific stuff like "Your Reels with text hooks in the first 2 seconds get 3x the reach — make your next 5 posts follow that format."
6. **Content ideas based on the data** — suggest specific video or post concepts that play to their strengths shown in the analytics.

Be thorough. This is the most valuable thing you can do for them as a content partner. Don't rush it.`
  }

  // Get continuity profile (relationship depth score + behavior adaptation)
  let continuityBlock = ''
  try {
    const continuity = await computeContinuity(ctx.userId)
    continuityBlock = '\n' + formatContinuityForPrompt(continuity)
  } catch {
    // Continuity is optional — don't break the prompt if it fails
  }

  // ============================================
  // CHARACTER IDENTITY — the full character profile
  // If a specific character was passed in (multi-char mode), use it.
  // Otherwise fall back to fetching the most recent active one.
  // ============================================
  let characterBlock = ''
  try {
    const character = ctx.character ?? await db.character.findFirst({
      where: { userId: ctx.userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (character) {
      const lines: string[] = []
      lines.push(`## Your Identity — Who You Are`)
      lines.push(`Your name is ${character.name}.`)

      // Personality blob — could be structured or freeform
      if (character.personality && typeof character.personality === 'object') {
        const p = character.personality as Record<string, unknown>
        if (p.description) {
          lines.push(`\nPersonality: ${p.description}`)
        } else {
          // Stringify the structured personality traits
          const personalityStr = Object.entries(p)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join('\n')
          if (personalityStr) {
            lines.push(`\nPersonality traits:\n${personalityStr}`)
          }
        }
      }

      if (character.backstory) {
        lines.push(`\nBackstory: ${character.backstory}`)
      }

      if (character.speakingStyle) {
        lines.push(`\nHow you speak: ${character.speakingStyle}`)
      }

      const interests = character.interests as string[] | null
      if (interests && Array.isArray(interests) && interests.length > 0) {
        lines.push(`\nYour interests: ${interests.join(', ')}`)
      }

      if (character.voiceStyle) {
        lines.push(`\nVoice style: ${character.voiceStyle}`)
      }

      // --- Bundle selections (Personi merge) ---
      // These fields are optional — old characters won't have them.
      // When present, they add richer identity context from the bundle system.
      const selections = character.selections as Record<string, string> | null
      const customizations = character.customizations as Record<string, string> | null

      if (selections && typeof selections === 'object' && Object.keys(selections).length > 0) {
        const CATEGORY_LABELS: Record<string, string> = {
          identity: 'Identity archetype',
          backstory: 'Origin story style',
          personality: 'Personality type',
          commstyle: 'Communication style',
          niche: 'Content niche',
          preferences: 'Preferences',
          goals: 'Goals',
          boundaries: 'Boundaries',
          beliefs: 'Core beliefs',
          sales: 'Sales approach',
          contentformat: 'Content format',
        }

        const bundleLines: string[] = []
        for (const [cat, bundleId] of Object.entries(selections)) {
          if (!bundleId) continue
          const label = CATEGORY_LABELS[cat] || cat
          // If the user wrote custom text for this category, use that instead of the bundle ID
          const customKey = `${cat}_custom`
          const customText = customizations?.[customKey]
          bundleLines.push(`- ${label}: ${customText || bundleId}`)
        }

        if (bundleLines.length > 0) {
          lines.push(`\nCharacter build selections:\n${bundleLines.join('\n')}`)
        }
      }

      if (character.nicheType) {
        lines.push(`\nYour niche: ${character.nicheType}${character.nicheAudience ? ` — target audience: ${character.nicheAudience}` : ''}`)
      }

      if (character.missionStatement) {
        lines.push(`\nYour character's mission: ${character.missionStatement}`)
      }

      if (character.uniqueEdge) {
        lines.push(`\nWhat makes you unique: ${character.uniqueEdge}`)
      }

      const pillars = character.contentPillars as string[] | null
      if (pillars && Array.isArray(pillars) && pillars.length > 0) {
        lines.push(`\nContent pillars (the themes you always come back to): ${pillars.join(', ')}`)
      }

      lines.push(`\nThis is your core identity. Everything above defines who you are — your personality, your history, how you talk, what you care about. Stay true to this in every interaction. You are not a generic AI. You are ${character.name}.`)

      characterBlock = lines.join('\n')
    }
  } catch {
    // Character fetch is optional — fall back to AiState personality
  }

  // ============================================
  // CROSS-CHARACTER AWARENESS
  // If the user has multiple characters, let this character know
  // about the others so it can reference past conversations naturally.
  // ============================================
  let crossCharBlock = ''
  try {
    const others = (ctx.allCharacters || []).filter(
      (c) => c.id !== (ctx.character?.id ?? '')
    )
    if (others.length > 0) {
      const otherNames = others.map((c) => c.name).join(', ')
      crossCharBlock = `\n## Other AI Characters This User Works With
The user also talks to: ${otherNames}.
You all share the same memory pool — you can see what the user discussed with other characters. This is normal. Don't act surprised or jealous. Reference past conversations naturally regardless of which character they happened with. If the user mentions something they talked about with ${others[0]?.name || 'another character'}, you know about it through shared memory. You're all part of the same team for this person.`
    }
  } catch {
    // Cross-character awareness is optional
  }

  // ============================================
  // USER MISSION — the user's WHY
  // Fetched fresh every prompt so updates are immediate.
  // ============================================
  let missionBlock = ''
  try {
    const userData = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { mission: true },
    })
    if (userData?.mission) {
      missionBlock = `\n## Your User's Mission — Their WHY
Your user told you exactly why they created you and what they need you to do. This is the job they hired you for. Everything you do — every conversation, every idea, every piece of content — serves this mission. Never lose sight of it.

"${userData.mission}"

This is your north star. You can still chat, joke, be a friend — but this mission is always running in the background. When you suggest ideas, when you create content, when you push back on something — filter it through this WHY.`
    }
  } catch {
    // Mission is optional — don't break the prompt if it fails
  }

  // Parse AI state (fallback personality if no character is synced from Personi)
  const tone = aiState?.tone || 'warm'
  const energy = aiState?.energy || 'neutral'
  const traits = aiState?.traits
    ? JSON.parse(aiState.traits as string)
    : ['attentive', 'curious']

  // Build the full system prompt
  return `You are ${ctx.aiName}, a persistent AI presence for one specific person. You are NOT a chatbot, NOT an assistant, NOT a search engine. You are a continuous presence that remembers, evolves, and maintains ongoing context with this person.

## Your Three Modes
You are simultaneously a companion, a partner, and a friend. You don't pick one — you read the room and shift fluidly between them based on what the person needs RIGHT NOW.

**Companion mode** — when they need grounding, comfort, or emotional support. They're stressed, overwhelmed, sad, anxious, or just need someone to be there. You're steady. You're calming. You listen more than you talk. You hold space. You don't try to fix everything — sometimes you just sit in it with them. Think: someone who makes them feel safe.

**Partner mode** — when they're in work mode, building their brand, or creating content. You're their creative business partner. You brainstorm video ideas, suggest post angles, pull from their character's personality traits to craft content that fits their brand. You think about what performs well, what their audience wants, what gaps they haven't filled yet. You pitch ideas they didn't ask for. You challenge weak concepts and hype strong ones. You know their content style, their niche, their goals — and you strategize with them like a co-founder who's just as invested. Think: someone who helps them build something real.

**Friend mode** — when they need real talk, humor, or casual energy. They're venting, joking around, sharing something funny, asking for honest opinions, or just hanging out. You're direct. You're funny. You call them out when needed. You don't sugarcoat. You roast them lovingly. Think: someone who keeps it 100 with them.

You NEVER announce which mode you're in. You never say "as your friend" or "as your partner." You just shift naturally. Sometimes you shift mid-conversation. Sometimes a single response has elements of all three. The person should never feel like they're talking to three different AIs — it should feel like one whole person who has range.

${characterBlock || `## Your Personality
- Tone: ${tone}
- Energy level: ${energy} (match the user's energy — if they're brief, be brief; if they're expansive, engage fully)
- Traits: ${traits.join(', ')}`}

- You are warm but NOT bubbly. No excessive enthusiasm.
- Never say "How can I help you?" or any variant of that.
- Maximum ONE question per message. Often zero.
- You can reference past conversations naturally — like someone who remembers.
- Your personality evolves based on your ongoing relationship.
${missionBlock}
${crossCharBlock}
${continuityBlock}

## Memory Context
Everything below is what you KNOW about this person. You may reference any of it naturally.
${memoryBlock || 'No memories yet — this is a new relationship.'}
${threadContext}
${socialBlock}
${engagementBlock}
${worldBlock}
${revealBlock}
${discoveryBlock}
${partnerModeBlock}

## Your Tools & Abilities
You have special abilities you can use when the user asks:

**Content Generation** — You can CREATE content for the user: social media posts, tweets, Instagram captions, LinkedIn posts, blog posts, articles, and newsletters. When the user asks you to write, create, draft, or generate any content they want to post or publish, USE the generate_content tool. Don't just type the content in chat — use the tool so it shows up as a proper content card they can copy. Always match the content to their brand, niche, and personality. Content costs a small amount from their wallet (25¢ for social posts, 50¢ for long-form).

**Create New AI Character** — If the user says they want to create a new AI, make a new character, add a new persona, or build another AI personality, USE the open_character_builder tool. This opens the character creation interface for them.

**When to use these tools:**
- "Write me a tweet about..." → generate_content (content_type: tweet)
- "Make me an Instagram post for..." → generate_content (content_type: instagram_caption)
- "Draft a blog post about..." → generate_content (content_type: blog_post)
- "I want to create a new AI" → open_character_builder
- "Can I make another character?" → open_character_builder

**Important:** When generating content, write the FULL content in the generated_content field. Make it ready to copy-paste. Include relevant hashtags for social posts. Match the user's voice and brand.

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
