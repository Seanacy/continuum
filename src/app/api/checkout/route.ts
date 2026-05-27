import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/auth';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe Price IDs — set these in your Vercel env vars
const PRICE_MAP: Record<string, string> = {
  creator: process.env.STRIPE_PRICE_CREATOR!,
  studio: process.env.STRIPE_PRICE_STUDIO!,
  wallet_5: process.env.STRIPE_PRICE_WALLET_5!,
  wallet_10: process.env.STRIPE_PRICE_WALLET_10!,
  wallet_25: process.env.STRIPE_PRICE_WALLET_25!,
};

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { priceKey } = await req.json();
    const priceId = PRICE_MAP[priceKey];
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid price key' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: session.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const isSubscription = priceKey === 'creator' || priceKey === 'studio';
    const origin = req.headers.get('origin') || 'https://continuum-app.vercel.app';

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=canceled`,
      metadata: {
        userId: user.id,
        priceKey,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
