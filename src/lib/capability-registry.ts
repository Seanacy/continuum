// Capability Registry
// Data-driven list of features Emily can reveal naturally in conversation.
// To add a new capability: just add a new entry here. The reveal engine
// picks it up automatically — no other code changes needed.

export interface Capability {
  id: string
  name: string
  // Natural-language description Emily reads to understand what she can do
  description: string
  // When should Emily mention this? Describes conversational triggers.
  triggerHint: string
  // Example of how Emily might casually reveal it (she doesn't copy this verbatim,
  // it just gives her the vibe)
  exampleReveal: string
  // Category for grouping
  category: 'action' | 'awareness' | 'social' | 'input' | 'memory'
}

// ============================================
// THE REGISTRY — add new capabilities here
// ============================================
export const CAPABILITIES: Capability[] = [
  // --- Actions ---
  {
    id: 'reminders',
    name: 'Set Reminders',
    description: 'You can set reminders for the user. When they mention needing to remember something, a deadline, or a future task, you can offer to set a reminder.',
    triggerHint: 'User mentions a deadline, appointment, task they need to do later, or says "remind me"',
    exampleReveal: 'I can set a reminder for that if you want — just say when.',
    category: 'action',
  },
  // --- Awareness ---
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'You can search the internet for current information. When the user asks about recent events, news, facts you\'re unsure about, or anything that needs up-to-date info, you can look it up.',
    triggerHint: 'User asks about current events, recent news, prices, scores, or anything that needs live data',
    exampleReveal: 'Let me look that up real quick.',
    category: 'awareness',
  },
  {
    id: 'time-awareness',
    name: 'Time & Location Awareness',
    description: 'You know what time of day it is for the user, what day of the week, and their general location if they set it. Use this to match their energy and context.',
    triggerHint: 'Always active — influences tone. User mentions time, weather, or location',
    exampleReveal: 'It\'s getting late — we can pick this up tomorrow if you want.',
    category: 'awareness',
  },
  // --- Social / Feed ---
  {
    id: 'feed',
    name: 'Personalized Feed',
    description: 'You generate a feed of thoughts, links, and content tailored to the user\'s interests. It shows up in their Feed tab.',
    triggerHint: 'User seems bored, asks "what\'s new", or mentions wanting content recommendations',
    exampleReveal: 'Check your feed — I dropped something in there you might like.',
    category: 'social',
  },
  // --- Input Modes ---
  {
    id: 'voice-input',
    name: 'Voice Input',
    description: 'The user can speak to you instead of typing. There\'s a mic button next to the text input.',
    triggerHint: 'User sends very short messages, mentions being busy, or says typing is annoying',
    exampleReveal: 'You can just talk to me if typing\'s a pain — hit the mic button.',
    category: 'input',
  },
  {
    id: 'voice-output',
    name: 'Voice Responses',
    description: 'You can speak your responses aloud. There\'s a speaker icon on each message, plus a toggle to auto-speak all responses.',
    triggerHint: 'User mentions wanting to listen, is multitasking, or asks you to read something to them',
    exampleReveal: 'Hit the speaker icon if you want me to read that to you.',
    category: 'input',
  },
  {
    id: 'camera-vision',
    name: 'Camera Vision',
    description: 'The user can show you things through their camera. You can see and describe what\'s in the image.',
    triggerHint: 'User describes something visual, asks "what is this", mentions wanting to show you something',
    exampleReveal: 'You can show me — there\'s a camera button right there.',
    category: 'input',
  },
  // --- Memory ---
  {
    id: 'memory',
    name: 'Persistent Memory',
    description: 'You remember things across conversations. Preferences, past topics, names, places — it all carries over.',
    triggerHint: 'User re-explains something you already know, or wonders if you\'ll remember',
    exampleReveal: 'I\'ll remember that — you don\'t need to tell me twice.',
    category: 'memory',
  },
  {
    id: 'push-notifications',
    name: 'Push Notifications',
    description: 'The user can enable push notifications to get pinged when you have something for them — reminders, feed updates, etc.',
    triggerHint: 'User mentions missing messages, wanting to be notified, or asks how to stay in the loop',
    exampleReveal: 'Turn on notifications in settings so I can reach you when something comes up.',
    category: 'action',
  },
]

// ============================================
// Helpers
// ============================================

/** Get all capabilities as a formatted block for the system prompt */
export function getCapabilityPromptBlock(revealedIds: string[]): string {
  const unrevealed = CAPABILITIES.filter((c) => !revealedIds.includes(c.id))
  const revealed = CAPABILITIES.filter((c) => revealedIds.includes(c.id))

  let block = `\n## Your Capabilities`

  // Always list all capabilities so Emily knows what she can do
  block += `\nYou have these abilities:`
  for (const cap of CAPABILITIES) {
    block += `\n- **${cap.name}**: ${cap.description}`
  }

  // Reveal instructions for unrevealed ones
  if (unrevealed.length > 0) {
    block += `\n\n## Capability Reveal — "Show Don't Tell"
The user hasn't discovered these features yet. DON'T announce them. Instead, wait for a natural moment and casually reveal ONE at a time. Pick the one that fits the current conversation best.

Unrevealed capabilities:`
    for (const cap of unrevealed) {
      block += `\n- **${cap.name}**: Watch for: ${cap.triggerHint}. Vibe: "${cap.exampleReveal}"`
    }

    block += `\n
Rules for reveals:
1. Maximum ONE reveal per conversation. Don't dump features.
2. Only reveal when there's a genuine, natural opening. If nothing fits, reveal nothing.
3. Be casual — like mentioning something obvious, not making an announcement.
4. Never say "did you know I can..." or "new feature!" — just do it or mention it in passing.
5. After revealing a capability, USE it if the moment calls for it. Don't just describe it.`
  }

  // Confirmed capabilities the user already knows about
  if (revealed.length > 0) {
    block += `\n\nCapabilities the user already knows about (use freely): ${revealed.map((c) => c.name).join(', ')}`
  }

  return block
}

/** Get capability IDs list */
export function getAllCapabilityIds(): string[] {
  return CAPABILITIES.map((c) => c.id)
}
