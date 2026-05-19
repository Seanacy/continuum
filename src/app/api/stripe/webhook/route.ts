import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Stripe sends events here when subscriptions change
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      if (userId && session.subscription) {
        await db.user.update({
          where: { id: userId },
          data: {
            tier: 'pro',
            stripeSubId: session.subscription as string,
            stripeCustomerId: session.customer as string,
          },
        })
        console.log(`[Stripe] User ${userId} upgraded to pro`)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const user = await db.user.findFirst({
        where: { stripeCustomerId: customerId },
      })
      if (user) {
        await db.user.update({
          where: { id: user.id },
          data: { tier: 'free', stripeSubId: null },
        })
        console.log(`[Stripe] User ${user.id} downgraded to free`)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const user = await db.user.findFirst({
        where: { stripeCustomerId: customerId },
      })
      if (user) {
        // If subscription is active/trialing = pro, otherwise free
        const isActive = sub.status === 'active' || sub.status === 'trialing'
        await db.user.update({
          where: { id: user.id },
          data: { tier: isActive ? 'pro' : 'free' },
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
