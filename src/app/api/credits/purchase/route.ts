import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { addFunds, PRICING, centsToDollars } from '@/lib/credit-system'

export const dynamic = 'force-dynamic'

// POST — deposit funds into wallet
// When Stripe is connected, this will be called by the Stripe webhook
// after a successful payment. For now, it's a placeholder.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const amountCents = body.amountCents || 0

  if (amountCents < PRICING.MIN_DEPOSIT_CENTS) {
    return NextResponse.json(
      { error: `Minimum deposit is ${centsToDollars(PRICING.MIN_DEPOSIT_CENTS)}` },
      { status: 400 }
    )
  }

  if (amountCents > PRICING.MAX_DEPOSIT_CENTS) {
    return NextResponse.json(
      { error: `Maximum deposit is ${centsToDollars(PRICING.MAX_DEPOSIT_CENTS)}` },
      { status: 400 }
    )
  }

  // TODO: When Stripe is connected:
  // 1. Create a Stripe checkout session for amountCents
  // 2. Return the checkout URL
  // 3. On successful payment, Stripe webhook calls addFunds()
  //
  // For now, funds are added directly (no real payment)
  const balance = await addFunds(user.id, amountCents, {
    source: 'direct_deposit',
    note: 'Stripe not connected — funds added directly',
  })

  return NextResponse.json({
    success: true,
    deposited: centsToDollars(amountCents),
    balance,
  })
}
