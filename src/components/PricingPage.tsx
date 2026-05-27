'use client';
import { useState } from 'react';

// =============================================
// PRICING PAGE — shows tiers + wallet top-ups
// =============================================

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'Get started with your first AI character',
    features: [
      '1 AI character',
      '5 messages per day',
      'Basic chat experience',
      'Community access',
    ],
    limits: [
      'No content packs',
      'No image generation',
      'No Orbit projects',
      'No business profiles',
    ],
    cta: 'Current Plan',
    popular: false,
    priceId: null,
  },
  {
    id: 'creator',
    name: 'Creator',
    price: '$4.99',
    period: '/month',
    description: 'Unlock content creation & business tools',
    features: [
      '1 AI character',
      '30 messages per day',
      'Content packs',
      'AI image generation',
      '1 Orbit project',
      '1 business profile',
      'Wallet top-ups enabled',
    ],
    limits: [
      'No video generation',
      'No priority support',
    ],
    cta: 'Upgrade to Creator',
    popular: true,
    priceId: 'creator',
  },
  {
    id: 'studio',
    name: 'Studio',
    price: '$29',
    period: '/month',
    description: 'Everything unlimited — go all in',
    features: [
      'Unlimited characters',
      'Unlimited messages',
      'All content packs',
      'AI image generation',
      'AI video generation',
      'Unlimited Orbit projects',
      'Unlimited businesses',
      'Wallet top-ups enabled',
      'Priority support',
    ],
    limits: [],
    cta: 'Upgrade to Studio',
    popular: false,
    priceId: 'studio',
  },
];

const WALLET_OPTIONS = [
  { amount: 500, display: '$5', label: '$5 Top-Up', priceKey: 'wallet_5' },
  { amount: 1000, display: '$10', label: '$10 Top-Up', priceKey: 'wallet_10' },
  { amount: 2500, display: '$25', label: '$25 Top-Up', priceKey: 'wallet_25' },
];

export default function PricingPage({ currentTier = 'free', walletBalance = 0, onClose }: {
  currentTier?: string;
  walletBalance?: number;
  onClose?: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (priceKey: string) => {
    setLoading(priceKey);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      setError('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading('manage');
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Could not open billing portal');
      }
    } catch {
      setError('Failed to open billing portal');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(0,0,0,0.92)',
    }}>
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        padding: '20px 20px 40px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{
            fontSize: 36, fontWeight: 800, color: '#fff',
            margin: '0 0 8px 0',
            background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Choose Your Plan</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, margin: 0 }}>
            Unlock more characters, messages, and AI creation tools
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8, padding: '10px 16px', color: '#fca5a5',
            marginBottom: 20, fontSize: 14, maxWidth: 600, width: '100%',
          }}>{error}</div>
        )}

        <div style={{
          display: 'flex', gap: 20, flexWrap: 'wrap',
          justifyContent: 'center', maxWidth: 1000, marginBottom: 48,
        }}>
          {TIERS.map((tier) => {
            const isCurrentTier = currentTier === tier.id;
            const isPopular = tier.popular;
            return (
              <div key={tier.id} style={{
                background: isPopular
                  ? 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(96,165,250,0.15))'
                  : 'rgba(255,255,255,0.05)',
                border: isPopular
                  ? '2px solid rgba(167,139,250,0.5)'
                  : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16, padding: 28, width: 280,
                position: 'relative', transition: 'transform 0.2s',
              }}>
                {isPopular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    padding: '4px 14px', borderRadius: 20,
                  }}>MOST POPULAR</div>
                )}
                <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 4px 0' }}>
                  {tier.name}
                </h2>
                <div style={{ margin: '12px 0' }}>
                  <span style={{ color: '#fff', fontSize: 36, fontWeight: 800 }}>{tier.price}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{tier.period}</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '0 0 16px 0' }}>
                  {tier.description}
                </p>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                  {tier.features.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8,
                    }}>
                      <span style={{ color: '#34d399' }}>✓</span> {f}
                    </div>
                  ))}
                  {tier.limits.map((l, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 8,
                    }}>
                      <span>✗</span> {l}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => tier.priceId && handleCheckout(tier.priceId)}
                  disabled={isCurrentTier || !tier.priceId || loading !== null}
                  style={{
                    width: '100%', padding: '12px 0', marginTop: 16,
                    borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14,
                    cursor: isCurrentTier || !tier.priceId ? 'default' : 'pointer',
                    background: isCurrentTier
                      ? 'rgba(255,255,255,0.1)'
                      : isPopular
                        ? 'linear-gradient(135deg, #a78bfa, #60a5fa)'
                        : 'rgba(255,255,255,0.1)',
                    color: isCurrentTier
                      ? 'rgba(255,255,255,0.4)'
                      : '#fff',
                    transition: 'opacity 0.2s',
                    opacity: (loading !== null && loading === tier.priceId) ? 0.6 : 1,
                  }}
                >
                  {(loading !== null && loading === tier.priceId) ? 'Loading...'
                    : isCurrentTier ? '✓ Current Plan'
                    : tier.cta}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ maxWidth: 700, width: '100%', textAlign: 'center' }}>
          <h2 style={{
            color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 8px 0',
          }}>Wallet Top-Up</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 8px 0' }}>
            Pay-as-you-go for image generation, video creation, and premium features
          </p>
          <p style={{ color: '#a78bfa', fontSize: 18, fontWeight: 600, margin: '0 0 24px 0' }}>
            Current balance: ${(walletBalance / 100).toFixed(2)}
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              {WALLET_OPTIONS.map((opt) => (
                <button
                  key={opt.priceKey}
                  onClick={() => handleCheckout(opt.priceKey)}
                  disabled={currentTier === 'free' || loading !== null}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12, padding: '20px 32px',
                    cursor: currentTier === 'free' ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: currentTier === 'free' ? 0.4 : (loading !== null && loading === opt.priceKey) ? 0.6 : 1,
                  }}
                >
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>{opt.display}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
                    {opt.label}
                  </div>
                </button>
              ))}
            </div>
            {currentTier === 'free' && (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 12 }}>
                Upgrade to a paid plan to enable wallet top-ups
              </p>
            )}
        </div>

        {currentTier !== 'free' && (
          <button
            onClick={handleManageSubscription}
            disabled={loading === 'manage'}
            style={{
              marginTop: 32, background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.4)', fontSize: 13,
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            {loading === 'manage' ? 'Opening...' : 'Manage subscription / Cancel'}
          </button>
        )}
      </div>

      {onClose && (
        <button onClick={onClose} style={{
          flexShrink: 0,
          background: 'rgba(30,30,30,0.98)',
          border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', fontSize: 16, fontWeight: 600,
          padding: '18px 0',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8,
        }}>← Back</button>
      )}
    </div>
  );
}
