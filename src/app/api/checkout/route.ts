import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const isWallet = priceKey.startsWith('wallet_');
    const baseUrl = process.env.NEXTAUTH_URL || 'https://continuum-app.vercel.app';

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: isWallet ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: baseUrl + '?checkout=success',
      cancel_url: baseUrl + '?checkout=cancel',
      metadata: { userId: user.id, priceKey },
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email || undefined }),
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
