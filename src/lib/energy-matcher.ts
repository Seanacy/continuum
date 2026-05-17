// Energy Matcher
// Detects user's communication energy and updates AI state to match
// Runs silently after each message — no LLM call needed

import { db } from './db'

type Energy = 'low' | 'neutral' | 'high'

export function detectEnergy(message: string): Energy {
  const length = message.length
  const hasExclamation = message.includes('!')
  const emojiRegex = new RegExp('[\uD83C-􏰀-\uDFFF]+')
  const hasEmoji = emojiRegex.test(message)
  const wordCount = message.split(/\s+/).length
  const avgWordLength = length / Math.max(wordCount, 1)
  const hasQuestion = message.includes('?')
  const isAllCaps = message === message.toUpperCase() && message.length > 3

  let score = 0

  // Length signals
  if (wordCount <= 5) score -= 1      // brief = low energy
  if (wordCount >= 30) score += 1     // verbose = high energy

  // Punctuation/emoji signals
  if (hasExclamation) score += 1
  if (hasEmoji) score += 1
  if (isAllCaps) score += 2

  // Short, no punctuation = low
  if (wordCount <= 3 && !hasExclamation && !hasQuestion) score -= 2

  // Determine energy level
  if (score <= -1) return 'low'
  if (score >= 2) return 'high'
  return 'neutral'
}

export async function updateUserEnergy(userId: string, message: string): Promise<void> {
  const energy = detectEnergy(message)

  await db.aiState.update({
    where: { userId },
    data: { energy },
  })
}
