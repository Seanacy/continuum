// Credit System
// Handles all credit operations — purchasing, spending, checking balances
// Video credits and chat credits are separate buckets
//
// Pricing:
// - 1 video credit = $1.75 (user pays) / ~$0.58 (our cost) / ~$0.92 profit
// - Each video credit purchase also grants 50 chat messages
// - New users get 10 free chat messages (no purchase needed)
// - Chat is locked once free messages + credit messages run out
//
// Stripe is NOT connected yet. Credits are added manually or via
// a placeholder purchase endpoint. When Stripe is ready, the webhook
// just calls addVideoCredits() on successful payment.

import { db } from './db'

// ============================================
// CONSTANTS
// ============================================
export const PRICING = {
  VIDEO_CREDIT_PRICE: 1.75,       // what user pays per video
  VIDEO_COST_TO_US: 0.58,         // our actual cost per video
  CHAT_MESSAGES_PER_VIDEO: 50,    // chat messages bundled per video purchase
  FREE_STARTER_MESSAGES: 10,      // free messages on signup
  CHAT_COST_PER_MESSAGE: 0.005,   // our cost per chat message
} as const

// ============================================
// CHECK BALANCE — can the user chat or generate?
// ============================================
export interface CreditBalance {
  chatCredits: number
  videoCredits: number
  freeMessages: number
  canChat: boolean
  canGenerateVideo: boolean
  chatRemaining: number  // total messages available (free + credits)
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      creditBalance: true,
      videoCredits: true,
      freeMessages: true,
    },
  })

  if (!user) throw new Error('User not found')

  const chatRemaining = user.freeMessages + user.creditBalance
  return {
    chatCredits: user.creditBalance,
    videoCredits: user.videoCredits,
    freeMessages: user.freeMessages,
    canChat: chatRemaining > 0,
    canGenerateVideo: user.videoCredits > 0,
    chatRemaining,
  }
}

// ============================================
// ADD CREDITS — called when user purchases
// ============================================
export async function addVideoCredits(
  userId: string,
  quantity: number,
  metadata: Record<string, unknown> = {}
): Promise<CreditBalance> {
  const chatCreditsToAdd = quantity * PRICING.CHAT_MESSAGES_PER_VIDEO

  const user = await db.user.update({
    where: { id: userId },
    data: {
      videoCredits: { increment: quantity },
      creditBalance: { increment: chatCreditsToAdd },
    },
    select: {
      creditBalance: true,
      videoCredits: true,
      freeMessages: true,
    },
  })

  // Log the video credit purchase
  await db.creditTransaction.create({
    data: {
      userId,
      type: 'purchase',
      amount: quantity,
      resource: 'video_credit',
      balanceAfter: user.videoCredits,
      metadata: {
        ...metadata,
        chatCreditsAdded: chatCreditsToAdd,
        pricePerCredit: PRICING.VIDEO_CREDIT_PRICE,
        totalCharged: quantity * PRICING.VIDEO_CREDIT_PRICE,
      },
    },
  })

  // Log the bundled chat credits
  await db.creditTransaction.create({
    data: {
      userId,
      type: 'purchase',
      amount: chatCreditsToAdd,
      resource: 'chat_credit',
      balanceAfter: user.creditBalance,
      metadata: { source: 'video_purchase', videoCredits: quantity },
    },
  })

  return getCreditBalance(userId)
}

// ============================================
// SPEND CHAT CREDIT — called per chat message
// ============================================
export interface SpendResult {
  allowed: boolean
  remaining: number
  source: 'free' | 'credits' | 'none'
}

export async function spendChatCredit(userId: string): Promise<SpendResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      creditBalance: true,
      freeMessages: true,
    },
  })

  if (!user) return { allowed: false, remaining: 0, source: 'none' }

  // Use free messages first
  if (user.freeMessages > 0) {
    const updated = await db.user.update({
      where: { id: userId },
      data: { freeMessages: { decrement: 1 } },
      select: { freeMessages: true, creditBalance: true },
    })
    return {
      allowed: true,
      remaining: updated.freeMessages + updated.creditBalance,
      source: 'free',
    }
  }

  // Then use purchased credits
  if (user.creditBalance > 0) {
    const updated = await db.user.update({
      where: { id: userId },
      data: { creditBalance: { decrement: 1 } },
      select: { freeMessages: true, creditBalance: true },
    })

    await db.creditTransaction.create({
      data: {
        userId,
        type: 'spend_chat',
        amount: -1,
        resource: 'chat_credit',
        balanceAfter: updated.creditBalance,
      },
    })

    return {
      allowed: true,
      remaining: updated.freeMessages + updated.creditBalance,
      source: 'credits',
    }
  }

  // No credits left
  return { allowed: false, remaining: 0, source: 'none' }
}

// ============================================
// SPEND VIDEO CREDIT — called when generating a video
// ============================================
export async function spendVideoCredit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { videoCredits: true },
  })

  if (!user || user.videoCredits <= 0) {
    return { allowed: false, remaining: user?.videoCredits || 0 }
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { videoCredits: { decrement: 1 } },
    select: { videoCredits: true },
  })

  await db.creditTransaction.create({
    data: {
      userId,
      type: 'spend_video',
      amount: -1,
      resource: 'video_credit',
      balanceAfter: updated.videoCredits,
    },
  })

  return { allowed: true, remaining: updated.videoCredits }
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
  amount: number
  resource: string
  balanceAfter: number
  createdAt: Date
}>> {
  return db.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      amount: true,
      resource: true,
      balanceAfter: true,
      createdAt: true,
    },
  })
}
