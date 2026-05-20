import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { addVideoCredits, PRICING } from '@/lib/credit-system'

export const dynamic = 'force-dynamic'

// POST — purchase video credits
// When Stripe is connected, this will be called by the Stripe webhook
// after a successful payment. For now, it's a placeholder that can be
// called directly for testing. In production, remove direct access
// and only allow the webhook to add credits.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const quantity = body.quantity || 1

  if (quantity < 1 || quantity > 100) {
    return NextResponse.json(
      { error: 'Quantity must be between 1 and 100' },
      { status: 400 }
    )
  }

  // TODO: When Stripe is connected, this endpoint will:
  // 1. Create a Stripe checkout session for (quantity * PRICING.VIDEO_CREDIT_PRICE)
  // 2. Return the checkout URL
  // 3. On successful payment, Stripe webhook calls addVideoCredits()
  //
  // For now, credits are added directly (no real payment)
  const balance = await addVideoCredits(user.id, quantity, {
    source: 'direct_purchase',
    note: 'Stripe not connected — credits added directly',
  })

  return NextResponse.json({
    success: true,
    purchased: {
      videoCredits: quantity,
      chatMessages: quantity * PRICING.CHAT_MESSAGES_PER_VIDEO,
      totalPrice: quantity * PRICING.VIDEO_CREDIT_PRICE,
    },
    balance,
  })
}
