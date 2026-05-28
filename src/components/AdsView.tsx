'use client'

import React, { useState, useEffect, useCallback } from 'react'

interface AdMetrics {
  impressions?: string
  reach?: string
  clicks?: string
  cpc?: string
  cpm?: string
  ctr?: string
  spend?: string
  frequency?: string
  actions?: any[]
}

interface AdRecord {
  id: string
  name: string
  objective: string
  status: string
  adFormat: string
  content: any
  targeting: any
  budget: any
  schedule: any
  metrics: AdMetrics
  metricsUpdatedAt: string | null
  metaCampaignId: string | null
  metaAdId: string | null
  chargeAmountCents: number
  errorMessage: string | null
  createdAt: string
  facebookAccount?: { fbPageName: string | null }
}

interface AccountHealth {
  id: string
  fbPageName: string | null
  adAccountId: string | null
  igAccountId: string | null
  status: string
  daysUntilExpiry: number
  health: 'good' | 'warning' | 'expired' | 'disconnected'
}

function getMetric(m: AdMetrics | null | undefined, key: string, fallback: string = '0'): string {
  if (!m) return fallback
  return (m as any)[key] || fallback
}

function formatNumber(n: string | number): string {
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '0'
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatMoney(n: string | number): string {
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '$0.00'
  return '$' + num.toFixed(2)
}

function formatPercent(n: string | number): string {
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '0.00%'
  return num.toFixed(2) + '%'
}

export default function AdsView() {
  const [ads, setAds] = useState<AdRecord[]>([])
  const [accounts, setAccounts] = useState<AccountHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'pending'>('all')
  const [selectedAd, setSelectedAd] = useState<AdRecord | null>(null)

  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch('/api/ads/list')
      if (res.ok) {
        const data = await res.json()
        setAds(data.ads || [])
      }
    } catch {
      setError('Failed to load ads')
    }
    setLoading(false)
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/ads/accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchAds()
    fetchAccounts()
  }, [fetchAds, fetchAccounts])

  async function refreshMetrics() {
    setRefreshing(true)
    try {
      await fetch('/api/ads/metrics/refresh', { method: 'POST' })
      await fetchAds()
    } catch {
      setError('Failed to refresh metrics')
    }
    setRefreshing(false)
  }

  async function refreshSingleAd(adId: string) {
    try {
      await fetch('/api/ads/' + adId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh_metrics' }),
      })
      await fetchAds()
    } catch {}
  }

  async function toggleAdStatus(adId: string, action: 'activate' | 'pause') {
    try {
      const res = await fetch('/api/ads/' + adId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        await fetchAds()
        if (selectedAd && selectedAd.id === adId) {
          const updated = ads.find(a => a.id === adId)
          if (updated) setSelectedAd(updated)
        }
      }
    } catch {}
  }

  async function deleteAd(adId: string) {
    if (!confirm('Delete this ad? This cannot be undone.')) return
    try {
      const res = await fetch('/api/ads/' + adId, { method: 'DELETE' })
      if (res.ok) {
        setSelectedAd(null)
        await fetchAds()
      }
    } catch {}
  }

  const filteredAds = ads.filter(ad => {
    if (filter === 'all') return true
    if (filter === 'active') return ad.status === 'active'
    if (filter === 'paused') return ad.status === 'paused'
    if (filter === 'pending') return ad.status === 'pending' || ad.status === 'draft'
    return true
  })

  // Aggregate stats
  const totalImpressions = ads.reduce((s, a) => s + parseFloat(getMetric(a.metrics, 'impressions')), 0)
  const totalClicks = ads.reduce((s, a) => s + parseFloat(getMetric(a.metrics, 'clicks')), 0)
  const totalSpend = ads.reduce((s, a) => s + parseFloat(getMetric(a.metrics, 'spend')), 0)
  const totalReach = ads.reduce((s, a) => s + parseFloat(getMetric(a.metrics, 'reach')), 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

  // Account health alerts
  const expiredAccounts = accounts.filter(a => a.health === 'expired')
  const warningAccounts = accounts.filter(a => a.health === 'warning')
  const disconnectedAccounts = accounts.filter(a => a.health === 'disconnected')

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      completed: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    }
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  function objectiveLabel(obj: string) {
    const map: Record<string, string> = {
      OUTCOME_AWARENESS: 'Awareness',
      OUTCOME_TRAFFIC: 'Traffic',
      OUTCOME_ENGAGEMENT: 'Engagement',
      OUTCOME_LEADS: 'Leads',
      OUTCOME_SALES: 'Sales',
    }
    return map[obj] || obj
  }

  // Account health banner component
  function AccountHealthBanners() {
    if (expiredAccounts.length === 0 && warningAccounts.length === 0 && disconnectedAccounts.length === 0) {
      return null
    }

    return (
      <div className="space-y-2 mb-4">
        {expiredAccounts.map(acc => (
          <div key={acc.id} className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 flex-shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="text-sm text-red-400">
                <strong>{acc.fbPageName || 'Facebook Account'}</strong> — Token expired. Reconnect to keep ads running.
              </span>
            </div>
            <a
              href="/api/meta/connect"
              className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition font-medium flex-shrink-0"
            >
              Reconnect
            </a>
          </div>
        ))}
        {disconnectedAccounts.map(acc => (
          <div key={acc.id} className="p-3 rounded-xl bg-gray-500/10 border border-gray-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
              </svg>
              <span className="text-sm text-gray-400">
                <strong>{acc.fbPageName || 'Facebook Account'}</strong> — Disconnected. Reconnect to resume.
              </span>
            </div>
            <a
              href="/api/meta/connect"
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition font-medium flex-shrink-0"
            >
              Reconnect
            </a>
          </div>
        ))}
        {warningAccounts.map(acc => (
          <div key={acc.id} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 flex-shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="text-sm text-amber-400">
                <strong>{acc.fbPageName || 'Facebook Account'}</strong> — Token expires in {acc.daysUntilExpiry} day{acc.daysUntilExpiry !== 1 ? 's' : ''}. Reconnect soon to avoid interruption.
              </span>
            </div>
            <a
              href="/api/meta/connect"
              className="px-3 py-1.5 rounded-lg text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition font-medium flex-shrink-0"
            >
              Refresh Token
            </a>
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-continuum-muted">
        <span className="animate-pulse">Loading ads...</span>
      </div>
    )
  }

  // Detail view
  if (selectedAd) {
    const m = selectedAd.metrics || {}
    return (
      <div className="h-full overflow-y-auto px-4 py-4">
        <AccountHealthBanners />

        <button
          onClick={() => setSelectedAd(null)}
          className="flex items-center gap-1 text-sm text-continuum-muted hover:text-white mb-4 transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Back to Ads
        </button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">{selectedAd.name}</h2>
              <span className={"px-2 py-0.5 rounded-full text-[10px] font-medium border " + statusBadge(selectedAd.status)}>
                {selectedAd.status}
              </span>
            </div>
            <p className="text-xs text-continuum-muted">
              {objectiveLabel(selectedAd.objective)} &middot; {selectedAd.adFormat} &middot; Created {new Date(selectedAd.createdAt).toLocaleDateString()}
            </p>
            {selectedAd.facebookAccount?.fbPageName && (
              <p className="text-xs text-continuum-muted mt-0.5">Page: {selectedAd.facebookAccount.fbPageName}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshSingleAd(selectedAd.id)}
              className="px-3 py-1.5 rounded-lg text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
            >
              Refresh
            </button>
            {selectedAd.status === 'active' && (
              <button onClick={() => toggleAdStatus(selectedAd.id, 'pause')}
                className="px-3 py-1.5 rounded-lg text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition">
                Pause
              </button>
            )}
            {selectedAd.status === 'paused' && (
              <button onClick={() => toggleAdStatus(selectedAd.id, 'activate')}
                className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition">
                Activate
              </button>
            )}
            <button onClick={() => deleteAd(selectedAd.id)}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
              Delete
            </button>
          </div>
        </div>

        {selectedAd.errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            Error: {selectedAd.errorMessage}
          </div>
        )}

        {/* Performance metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Impressions</span>
            <span className="text-xl font-bold text-white">{formatNumber(getMetric(m, 'impressions'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Reach</span>
            <span className="text-xl font-bold text-white">{formatNumber(getMetric(m, 'reach'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Clicks</span>
            <span className="text-xl font-bold text-white">{formatNumber(getMetric(m, 'clicks'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Spend</span>
            <span className="text-xl font-bold text-white">{formatMoney(getMetric(m, 'spend'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">CTR</span>
            <span className="text-xl font-bold text-white">{formatPercent(getMetric(m, 'ctr'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">CPC</span>
            <span className="text-xl font-bold text-white">{formatMoney(getMetric(m, 'cpc'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">CPM</span>
            <span className="text-xl font-bold text-white">{formatMoney(getMetric(m, 'cpm'))}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Frequency</span>
            <span className="text-xl font-bold text-white">{parseFloat(getMetric(m, 'frequency', '0')).toFixed(1)}</span>
          </div>
        </div>

        {/* Ad content preview */}
        <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">Ad Content</h3>
          {selectedAd.content?.message && (
            <p className="text-sm text-continuum-muted mb-1">{selectedAd.content.message}</p>
          )}
          {selectedAd.content?.headline && (
            <p className="text-xs text-white font-medium">Headline: {selectedAd.content.headline}</p>
          )}
          {selectedAd.content?.linkUrl && (
            <p className="text-xs text-blue-400 mt-1">{selectedAd.content.linkUrl}</p>
          )}
        </div>

        {/* Targeting info */}
        <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">Targeting</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {selectedAd.targeting?.age_min && (
              <div><span className="text-continuum-muted">Age:</span> <span className="text-white">{selectedAd.targeting.age_min} - {selectedAd.targeting.age_max || 65}</span></div>
            )}
            {selectedAd.targeting?.genders && (
              <div><span className="text-continuum-muted">Gender:</span> <span className="text-white">{selectedAd.targeting.genders.includes(1) && selectedAd.targeting.genders.includes(2) ? 'All' : selectedAd.targeting.genders.includes(1) ? 'Male' : 'Female'}</span></div>
            )}
            {selectedAd.targeting?.geo_locations?.countries && (
              <div><span className="text-continuum-muted">Countries:</span> <span className="text-white">{selectedAd.targeting.geo_locations.countries.join(', ')}</span></div>
            )}
            {selectedAd.targeting?.interests && selectedAd.targeting.interests.length > 0 && (
              <div className="col-span-2"><span className="text-continuum-muted">Interests:</span> <span className="text-white">{selectedAd.targeting.interests.map((i: any) => i.name).join(', ')}</span></div>
            )}
          </div>
        </div>

        {/* Budget info */}
        <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">Budget & Schedule</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-continuum-muted">Type:</span> <span className="text-white">{selectedAd.budget?.type || 'daily'}</span></div>
            <div><span className="text-continuum-muted">Amount:</span> <span className="text-white">{formatMoney((selectedAd.budget?.amount || 0) / 100)}/day</span></div>
            {selectedAd.schedule?.startTime && (
              <div><span className="text-continuum-muted">Start:</span> <span className="text-white">{new Date(selectedAd.schedule.startTime).toLocaleDateString()}</span></div>
            )}
            {selectedAd.schedule?.endTime && (
              <div><span className="text-continuum-muted">End:</span> <span className="text-white">{new Date(selectedAd.schedule.endTime).toLocaleDateString()}</span></div>
            )}
          </div>
        </div>

        {selectedAd.metricsUpdatedAt && (
          <p className="text-[10px] text-continuum-muted text-center">
            Metrics last updated: {new Date(selectedAd.metricsUpdatedAt).toLocaleString()}
          </p>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Your Ads</h2>
        <div className="flex items-center gap-2">
          {ads.length > 0 && (
            <button
              onClick={refreshMetrics}
              disabled={refreshing}
              className={"px-3 py-1.5 rounded-lg text-xs transition " + (refreshing ? 'bg-blue-500/5 text-blue-400/50' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20')}
            >
              {refreshing ? 'Refreshing...' : 'Refresh All'}
            </button>
          )}
          <div className="flex items-center gap-1 bg-continuum-surface rounded-xl p-1">
            {(['all', 'active', 'paused', 'pending'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={"px-3 py-1.5 rounded-lg text-xs font-medium transition " + (filter === f ? 'bg-continuum-accent text-white' : 'text-continuum-muted hover:text-white')}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <AccountHealthBanners />

      {/* Summary stats */}
      {ads.length > 0 && (
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Ads</span>
            <span className="text-lg font-bold text-white">{ads.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Impressions</span>
            <span className="text-lg font-bold text-white">{formatNumber(totalImpressions)}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Clicks</span>
            <span className="text-lg font-bold text-white">{formatNumber(totalClicks)}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Avg CTR</span>
            <span className="text-lg font-bold text-white">{formatPercent(avgCtr)}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-[10px] text-continuum-muted uppercase tracking-wide">Total Spend</span>
            <span className="text-lg font-bold text-white">{formatMoney(totalSpend)}</span>
          </div>
        </div>
      )}

      {/* Ad list */}
      {filteredAds.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-continuum-surface flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-continuum-muted">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
          <p className="text-continuum-muted text-sm">
            {filter === 'all' ? 'No ads yet. Generate a Content Pack and hit "Publish as Ad" to get started!' : 'No ' + filter + ' ads.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAds.map(ad => {
            const m = ad.metrics || {}
            return (
              <div
                key={ad.id}
                onClick={() => setSelectedAd(ad)}
                className="p-4 rounded-xl bg-continuum-surface border border-continuum-border cursor-pointer hover:border-continuum-accent/50 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-white truncate">{ad.name}</h3>
                      <span className={"px-2 py-0.5 rounded-full text-[10px] font-medium border " + statusBadge(ad.status)}>
                        {ad.status}
                      </span>
                      <span className="text-[10px] text-continuum-muted">{ad.adFormat}</span>
                    </div>
                    <p className="text-xs text-continuum-muted truncate">
                      {objectiveLabel(ad.objective)}
                      {ad.facebookAccount?.fbPageName ? ' \u00b7 ' + ad.facebookAccount.fbPageName : ''}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-muted flex-shrink-0 mt-1">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-3 mb-3">
                  <div>
                    <span className="block text-[10px] text-continuum-muted">Impressions</span>
                    <span className="text-sm font-medium text-white">{formatNumber(getMetric(m, 'impressions'))}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-continuum-muted">Clicks</span>
                    <span className="text-sm font-medium text-white">{formatNumber(getMetric(m, 'clicks'))}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-continuum-muted">CTR</span>
                    <span className="text-sm font-medium text-white">{formatPercent(getMetric(m, 'ctr'))}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-continuum-muted">Spend</span>
                    <span className="text-sm font-medium text-white">{formatMoney(getMetric(m, 'spend'))}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-continuum-border">
                  {ad.status === 'active' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAdStatus(ad.id, 'pause'); }}
                      className="px-3 py-1.5 rounded-lg text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                    >
                      Pause
                    </button>
                  )}
                  {ad.status === 'paused' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAdStatus(ad.id, 'activate'); }}
                      className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteAd(ad.id); }}
                    className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition ml-auto"
                  >
                    Delete
                  </button>
                  <span className="text-[10px] text-continuum-muted">
                    {new Date(ad.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
