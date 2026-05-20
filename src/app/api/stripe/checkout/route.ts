import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

// Create a Stripe checkout session to upgrade to Pro
export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    select: { tier: true, stripeCustomerId: true, email: true },
  })

  if (fullUser?.tier === 'pro') {
    return NextResponse.json({ error: 'Already on Pro' }, { status: 400 })
  }

  const stripe = getStripe()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-app.vercel.app'

  // Reuse existing Stripe customer or create new one
  let customerId = fullUser?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: fullUser?.email || user.email,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: process.env.STRIPE_PRO_PRICE_ID!,
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/home?upgraded=true`,
    cancel_url: `${appUrl}/home?upgrade=cancelled`,
    metadata: { userId: user.id },
  })

  return NextResponse.json({ url: session.url })
}
