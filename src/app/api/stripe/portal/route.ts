import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

// Create a Stripe billing portal session (manage/cancel subscription)
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
    select: { stripeCustomerId: true },
  })

  if (!fullUser?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const stripe = getStripe()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-app.vercel.app'

  const session = await stripe.billingPortal.sessions.create({
    customer: fullUser.stripeCustomerId,
    return_url: `${appUrl}/home`,
  })

  return NextResponse.json({ url: session.url })
}
