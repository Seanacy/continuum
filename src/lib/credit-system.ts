// Wallet System
// Dollar-based wallet — balance stored in cents ($5.00 = 500 cents)
// Users deposit real money (via Stripe), spend it on video generation
// Chat is free (costs us ~$0.0002/msg on Haiku — negligible)
//
// Pricing:
// - Video generation: $2.50 per video (250 cents)
//   Cost breakdown:
//   - Higgsfield scene generation (Kling 3.0, 3 scenes): ~$0.87
//   - Shotstack video stitching (~$0.20/min, ~15s avg): ~$0.05
//   - ElevenLabs TTS narration: ~$0.04
//   - LLM script generation (Haiku): ~$0.03
//   - Total cost to us: ~$1.00
//   - Profit per video: ~$1.50 (60% margin)
//
// - Chat messages: FREE (no charge to user)
//
// No free credits. Wallet starts at $0.00.
// Stripe webhook calls addFunds() on successful payment.

import { db } from './db'

// ============================================
// CONSTANTS
// ============================================
export const PRICING = {
  VIDEO_PRICE_CENTS: 250,          // $2.50 per video
  VIDEO_COST_CENTS: 100,           // ~$1.00 cost to us
  CHAT_PRICE_CENTS: 0,             // chat is free
  MIN_DEPOSIT_CENTS: 500,          // $5.00 minimum deposit
  MAX_DEPOSIT_CENTS: 50000,        // $500.00 maximum deposit
} as const

// ============================================
// HELPERS — format cents as dollars
// ============================================
export function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ============================================
// GET WALLET BALANCE
// ============================================
export interface WalletBalance {
  balanceCents: number       // raw balance in cents
  balanceFormatted: string   // "$12.50"
  canGenerateVideo: boolean  // enough for at least 1 video
  videosAvailable: number    // how many videos they can afford
}

export async function getWalletBalance(userId: string): Promise<WalletBalance> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  })

  if (!user) throw new Error('User not found')

  const balanceCents = user.walletBalance
  return {
    balanceCents,
    balanceFormatted: centsToDollars(balanceCents),
    canGenerateVideo: balanceCents >= PRICING.VIDEO_PRICE_CENTS,
    videosAvailable: Math.floor(balanceCents / PRICING.VIDEO_PRICE_CENTS),
  }
}

// ============================================
// ADD FUNDS — called when user deposits money (Stripe webhook)
// ============================================
export async function addFunds(
  userId: string,
  amountCents: number,
  metadata: Record<string, unknown> = {}
): Promise<WalletBalance> {
  if (amountCents <= 0) throw new Error('Amount must be positive')

  const user = await db.user.update({
    where: { id: userId },
    data: { walletBalance: { increment: amountCents } },
    select: { walletBalance: true },
  })

  await db.creditTransaction.create({
    data: {
      userId,
      type: 'deposit',
      amountCents,
      balanceAfterCents: user.walletBalance,
      description: `Deposited ${centsToDollars(amountCents)}`,
      metadata: {
        ...metadata,
        amountFormatted: centsToDollars(amountCents),
      },
    },
  })

  return getWalletBalance(userId)
}

// ============================================
// CHARGE FOR VIDEO — deduct video price from wallet
// ============================================
export async function chargeForVideo(
  userId: string,
  metadata: Record<string, unknown> = {}
): Promise<{ allowed: boolean; remaining: number; remainingFormatted: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  })

  if (!user || user.walletBalance < PRICING.VIDEO_PRICE_CENTS) {
    return {
      allowed: false,
      remaining: user?.walletBalance || 0,
      remainingFormatted: centsToDollars(user?.walletBalance || 0),
    }
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { walletBalance: { decrement: PRICING.VIDEO_PRICE_CENTS } },
    select: { walletBalance: true },
  })

  await db.creditTransaction.create({
    data: {
      userId,
      type: 'video_charge',
      amountCents: -PRICING.VIDEO_PRICE_CENTS,
      balanceAfterCents: updated.walletBalance,
      description: `Video generation — ${centsToDollars(PRICING.VIDEO_PRICE_CENTS)}`,
      metadata,
    },
  })

  return {
    allowed: true,
    remaining: updated.walletBalance,
    remainingFormatted: centsToDollars(updated.walletBalance),
  }
}

// ============================================
// CHARGE CUSTOM AMOUNT — for future features with different prices
// ============================================
export async function chargeAmount(
  userId: string,
  amountCents: number,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<{ allowed: boolean; remaining: number }> {
  if (amountCents <= 0) throw new Error('Charge amount must be positive')

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  })

  if (!user || user.walletBalance < amountCents) {
    return { allowed: false, remaining: user?.walletBalance || 0 }
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { walletBalance: { decrement: amountCents } },
    select: { walletBalance: true },
  })

  await db.creditTransaction.create({
    data: {
      userId,
      type: 'charge',
      amountCents: -amountCents,
      balanceAfterCents: updated.walletBalance,
      description,
      metadata,
    },
  })

  return { allowed: true, remaining: updated.walletBalance }
}

// ============================================
// REFUND — add money back to wallet
// ============================================
export async function refund(
  userId: string,
  amountCents: number,
  reason: string = 'Refund'
): Promise<WalletBalance> {
  if (amountCents <= 0) throw new Error('Refund amount must be positive')

  const user = await db.user.update({
    where: { id: userId },
    data: { walletBalance: { increment: amountCents } },
    select: { walletBalance: true },
  })

  await db.creditTransaction.create({
    data: {
      userId,
      type: 'refund',
      amountCents,
      balanceAfterCents: user.walletBalance,
      description: `${reason} — ${centsToDollars(amountCents)}`,
    },
  })

  return getWalletBalance(userId)
}

// ============================================
// TRANSACTION HISTORY — for user's account page
// ============================================
export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<Array<{
  id: string
  type: string
  amountCents: number
  amountFormatted: string
  balanceAfterCents: number
  balanceAfterFormatted: string
  description: string
  createdAt: Date
}>> {
  const transactions = await db.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      amountCents: true,
      balanceAfterCents: true,
      description: true,
      createdAt: true,
    },
  })

  return transactions.map(t => ({
    ...t,
    amountFormatted: centsToDollars(Math.abs(t.amountCents)),
    balanceAfterFormatted: centsToDollars(t.balanceAfterCents),
  }))
}
