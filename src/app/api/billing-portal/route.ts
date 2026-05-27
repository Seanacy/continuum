import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

// POST /api/billing-portal — opens Stripe Customer Portal
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const dbUser = await db.user.findUnique({
      where: { email: user.email },
      select: { stripeCustomerId: true },
    });

    if (!dbUser?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: process.env.NEXTAUTH_URL || 'https://continuum-app.vercel.app',
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
