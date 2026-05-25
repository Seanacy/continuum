// Image quota tracking system
// Manages the daily 500-free-image limit across all users
// Automatically switches between free and paid Gemini API keys

import { db } from '@/lib/db'

const FREE_DAILY_LIMIT = 500
const PAID_COST_CENTS = 4 // $0.039 rounded up to 4 cents

// Get today's date as "YYYY-MM-DD" string
function getTodayString(): string {
  return new Date().toISOString().split('T')[0]
}

// Get or create today's quota row
async function getOrCreateTodayQuota() {
  const today = getTodayString()
  
  // Try to find existing row for today
  let quota = await db.imageQuota.findUnique({
    where: { date: today }
  })
  
  // If no row exists, create one
  if (!quota) {
    quota = await db.imageQuota.create({
      data: { date: today }
    })
  }
  
  return quota
}

// Check which tier to use and get the right API key
export async function getImageTier(): Promise<{
  tier: 'free' | 'paid'
  apiKey: string
  freeRemaining: number
  totalUsedToday: number
}> {
  const quota = await getOrCreateTodayQuota()
  const freeRemaining = Math.max(0, FREE_DAILY_LIMIT - quota.freeUsed)
  
  if (freeRemaining > 0) {
    // Still have free generations left
    const apiKey = process.env.GEMINI_API_KEY_FREE || ''
    return {
      tier: 'free',
      apiKey,
      freeRemaining,
      totalUsedToday: quota.freeUsed + quota.paidUsed
    }
  }
  
  // Free limit reached, use paid key
  const apiKey = process.env.GEMINI_API_KEY_PAID || ''
  return {
    tier: 'paid',
    apiKey,
    freeRemaining: 0,
    totalUsedToday: quota.freeUsed + quota.paidUsed
  }
}

// Record a completed image generation
export async function recordImageGeneration(options: {
  userId: string
  characterId?: string
  promptUsed: string
  referenceUrl?: string
  resultUrl?: string
  tier: 'free' | 'paid'
  metadata?: Record<string, any>
}): Promise<void> {
  const today = getTodayString()
  const costCents = options.tier === 'paid' ? PAID_COST_CENTS : 0
  
  // Update the daily quota counter
  await db.imageQuota.upsert({
    where: { date: today },
    create: {
      date: today,
      freeUsed: options.tier === 'free' ? 1 : 0,
      paidUsed: options.tier === 'paid' ? 1 : 0,
      paidCostCents: costCents
    },
    update: options.tier === 'free'
      ? { freeUsed: { increment: 1 } }
      : {
          paidUsed: { increment: 1 },
          paidCostCents: { increment: costCents }
        }
  })
  
  // Log the individual generation
  await db.imageGeneration.create({
    data: {
      userId: options.userId,
      characterId: options.characterId || null,
      promptUsed: options.promptUsed,
      referenceUrl: options.referenceUrl || null,
      resultUrl: options.resultUrl || null,
      tier: options.tier,
      costCents,
      status: 'completed',
      metadata: options.metadata || {}
    }
  })
}

// Mark a generation as failed (still counts against quota)
export async function recordFailedGeneration(options: {
  userId: string
  characterId?: string
  promptUsed: string
  tier: 'free' | 'paid'
  error: string
}): Promise<void> {
  await db.imageGeneration.create({
    data: {
      userId: options.userId,
      characterId: options.characterId || null,
      promptUsed: options.promptUsed,
      tier: options.tier,
      costCents: 0, // Don't charge for failures
      status: 'failed',
      metadata: { error: options.error }
    }
  })
}

// Get quota stats for admin/dashboard
export async function getQuotaStats(): Promise<{
  date: string
  freeUsed: number
  freeRemaining: number
  paidUsed: number
  paidCostCents: number
  totalToday: number
}> {
  const quota = await getOrCreateTodayQuota()
  return {
    date: quota.date,
    freeUsed: quota.freeUsed,
    freeRemaining: Math.max(0, FREE_DAILY_LIMIT - quota.freeUsed),
    paidUsed: quota.paidUsed,
    paidCostCents: quota.paidCostCents,
    totalToday: quota.freeUsed + quota.paidUsed
  }
}

// Get a user's generation history
export async function getUserGenerations(
  userId: string,
  limit: number = 20
) {
  return db.imageGeneration.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
}
