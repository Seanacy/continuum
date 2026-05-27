import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_CREATOR!]: 'creator',
  [process.env.STRIPE_PRICE_STUDIO!]: 'studio',
};

const WALLET_PRICES: Record<string, number> = {
  [process.env.STRIPE_PRICE_WALLET_5!]: 500,
  [process.env.STRIPE_PRICE_WALLET_10!]: 1000,
  [process.env.STRIPE_PRICE_WALLET_25!]: 2500,
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;
        if (!userId) break;

        if (session.mode === 'subscription') {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price.id;
          const tier = PRICE_TO_TIER[priceId] || 'free';

          await db.user.update({
            where: { id: userId },
            data: {
              tier,
              stripeSubId: sub.id,
              stripeCustomerId: session.customer as string,
            },
          });

          const cuid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
          await db.$executeRawUnsafe(
            `INSERT INTO subscriptions (id, user_id, stripe_sub_id, stripe_price_id, tier, status, current_period_start, current_period_end)
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), to_timestamp($8))
             ON CONFLICT (stripe_sub_id) DO UPDATE SET
               tier = $5, status = $6, current_period_start = to_timestamp($7), current_period_end = to_timestamp($8)`,
            cuid(), userId, sub.id, priceId, tier, sub.status,
            (sub as any).current_period_start, (sub as any).current_period_end
          );
        } else {
          // Wallet top-up
          const priceId = session.metadata?.priceKey;
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          const itemPriceId = lineItems.data[0]?.price?.id;
          const amount = WALLET_PRICES[itemPriceId || ''] || 0;

          if (amount > 0) {
            await db.user.update({
              where: { id: userId },
              data: {
                walletBalance: { increment: amount },
                stripeCustomerId: session.customer as string,
              },
            });
          }
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const priceId = sub.items.data[0]?.price.id;
        const tier = PRICE_TO_TIER[priceId] || 'free';

        // Find user by stripeSubId and update tier
        const users = await db.user.findMany({ where: { stripeSubId: sub.id } });
        if (users.length > 0) {
          await db.user.update({
            where: { id: users[0].id },
            data: { tier },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        // Downgrade to free
        const users = await db.user.findMany({ where: { stripeSubId: sub.id } });
        if (users.length > 0) {
          await db.user.update({
            where: { id: users[0].id },
            data: { tier: 'free', stripeSubId: null },
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
