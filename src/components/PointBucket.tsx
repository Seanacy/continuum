'use client';

import { useState, useEffect } from 'react';

interface QuotaData {
  date: string;
  freeUsed: number;
  freeRemaining: number;
  paidUsed: number;
  paidCostCents: number;
  totalToday: number;
}

export default function PointBucket() {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchQuota = async () => {
    try {
      const res = await fetch('/api/content-pipeline?info=quota');
      const data = await res.json();
      if (data.success && data.quota) {
        setQuota(data.quota);
      } else {
        setError('Could not load quota');
      }
    } catch (err) {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuota();
    // Refresh every 30 seconds
    const interval = setInterval(fetchQuota, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        fontSize: '13px',
        color: '#999',
      }}>
        ⚡ Loading...
      </div>
    );
  }

  if (error || !quota) {
    return null; // Silently hide if quota can't load
  }

  const isEmpty = quota.freeRemaining <= 0;
  const percentage = Math.round((quota.freeRemaining / 500) * 100);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      padding: '10px 16px',
      background: isEmpty
        ? 'rgba(255, 80, 80, 0.1)'
        : 'rgba(100, 220, 100, 0.08)',
      border: `1px solid ${isEmpty ? 'rgba(255,80,80,0.3)' : 'rgba(100,220,100,0.2)'}`,
      borderRadius: '14px',
      minWidth: '140px',
    }}>
      {/* Counter number */}
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        color: isEmpty ? '#ff5555' : '#66dd66',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {quota.freeRemaining}
      </div>

      {/* Label */}
      <div style={{
        fontSize: '11px',
        color: '#888',
        textAlign: 'center',
        lineHeight: 1.3,
      }}>
        of 500 free images today
      </div>

      {/* Empty state message */}
      {isEmpty && (
        <div style={{
          fontSize: '11px',
          color: '#ff8888',
          textAlign: 'center',
          marginTop: '4px',
          lineHeight: 1.3,
          fontWeight: 500,
        }}>
          Today&apos;s free images are used up — come back tomorrow!
        </div>
      )}
    </div>
  );
}
