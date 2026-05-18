// Reveal Engine
// Tracks which capabilities each user has discovered.
// Uses AiState.context JSON field to store revealed capability IDs.

import { db } from './db'
import { getCapabilityPromptBlock } from './capability-registry'

const REVEALED_KEY = 'revealedCapabilities'

/** Get the list of capability IDs the user has already seen */
export async function getRevealedCapabilities(userId: string): Promise<string[]> {
  try {
    const aiState = await db.aiState.findUnique({
      where: { userId },
      select: { context: true },
    })

    if (!aiState?.context || typeof aiState.context !== 'object') return []

    const ctx = aiState.context as Record<string, unknown>
    const revealed = ctx[REVEALED_KEY]

    if (Array.isArray(revealed)) {
      return revealed as string[]
    }

    return []
  } catch {
    return []
  }
}

/** Mark a capability as revealed for a user */
export async function markCapabilityRevealed(
  userId: string,
  capabilityId: string
): Promise<void> {
  try {
    const existing = await getRevealedCapabilities(userId)

    if (existing.includes(capabilityId)) return

    const updated = [...existing, capabilityId]

    // Get current context and merge
    const aiState = await db.aiState.findUnique({
      where: { userId },
      select: { context: true },
    })

    const currentCtx =
      aiState?.context && typeof aiState.context === 'object'
        ? (aiState.context as Record<string, unknown>)
        : {}

    await db.aiState.update({
      where: { userId },
      data: {
        context: {
          ...currentCtx,
          [REVEALED_KEY]: updated,
        },
      },
    })
  } catch {
    // Non-critical — don't break the flow
  }
}

/** Mark multiple capabilities as revealed at once */
export async function markCapabilitiesRevealed(
  userId: string,
  capabilityIds: string[]
): Promise<void> {
  for (const id of capabilityIds) {
    await markCapabilityRevealed(userId, id)
  }
}

/**
 * Get the capability reveal prompt block for this user.
 * This is what gets injected into the system prompt.
 */
export async function getRevealBlock(userId: string): Promise<string> {
  const revealed = await getRevealedCapabilities(userId)
  return getCapabilityPromptBlock(revealed)
}

/**
 * Scan an AI response for capability reveals and mark them.
 * Looks for natural mentions of capabilities in the response text.
 * Call this AFTER the AI responds so we track what was revealed.
 */
export async function detectAndMarkReveals(
  userId: string,
  aiResponse: string
): Promise<string[]> {
  const revealed = await getRevealedCapabilities(userId)
  const newlyRevealed: string[] = []
  const lower = aiResponse.toLowerCase()

  // Simple keyword detection for each unrevealed capability
  const detectionMap: Record<string, string[]> = {
    reminders: ['reminder', 'remind you', 'set a reminder', 'i\'ll remind'],
    'web-search': ['let me look', 'i\'ll search', 'looking that up', 'searched for', 'i found that'],
    'time-awareness': ['it\'s getting late', 'this time of night', 'morning', 'your evening'],
    feed: ['your feed', 'check your feed', 'dropped something in', 'feed tab'],
    'voice-input': ['mic button', 'talk to me', 'voice input', 'speak to me'],
    'voice-output': ['speaker icon', 'read that to you', 'read it aloud', 'listen to'],
    'camera-vision': ['camera button', 'show me', 'take a photo', 'camera'],
    memory: ['i\'ll remember', 'i remember', 'you told me', 'you mentioned'],
    'push-notifications': ['notifications', 'turn on notifications', 'notify you', 'push notification'],
  }

  for (const [capId, keywords] of Object.entries(detectionMap)) {
    if (revealed.includes(capId)) continue

    const mentioned = keywords.some((kw) => lower.includes(kw))
    if (mentioned) {
      newlyRevealed.push(capId)
    }
  }

  if (newlyRevealed.length > 0) {
    await markCapabilitiesRevealed(userId, newlyRevealed)
  }

  return newlyRevealed
}
