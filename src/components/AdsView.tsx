'use client'

import React, { useState, useEffect, useCallback } from 'react'

interface Ad {
  id: string
  campaignName: string
  adSetName: string
  adName: string
  status: string
  metaStatus: string
  contentType: string
  content: string
  headline: string
  objective: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  startTime: string
  endTime: string | null
  impressions: number
  clicks: number
  spend: number
  reach: number
  ctr: number
  cpc: number
  createdAt: string
}

export default function AdsView() {
  const [ads, setAds] = useState<Ad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'pending'>('all')

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

  useEffect(() => { fetchAds() }, [fetchAds])

  async function toggleAdStatus(adId: string, action: 'activate' | 'pause') {
    try {
      const res = await fetch(`/api/ads/${adId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) fetchAds()
    } catch {}
  }

  async function deleteAd(adId: string) {
    if (!confirm('Delete this ad? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/ads/${adId}`, { method: 'DELETE' })
      if (res.ok) fetchAds()
    } catch {}
  }

  const filteredAds = ads.filter(ad => {
    if (filter === 'all') return true
    if (filter === 'active') return ad.status === 'ACTIVE'
    if (filter === 'paused') return ad.status === 'PAUSED'
    if (filter === 'pending') return ad.status === 'PENDING_REVIEW' || ad.metaStatus === 'PENDING_REVIEW'
    return true
  })

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      PAUSED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      PENDING_REVIEW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
      ARCHIVED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    }
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-continuum-muted">
        <span className="animate-pulse">Loading ads...</span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Your Ads</h2>
        <div className="flex items-center gap-1 bg-continuum-surface rounded-xl p-1">
          {(['all', 'active', 'paused', 'pending'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f
                  ? 'bg-continuum-accent text-white'
                  : 'text-continuum-muted hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary stats */}
      {ads.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-xs text-continuum-muted">Total Ads</span>
            <span className="text-lg font-bold text-white">{ads.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-xs text-continuum-muted">Impressions</span>
            <span className="text-lg font-bold text-white">{ads.reduce((s, a) => s + a.impressions, 0).toLocaleString()}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-xs text-continuum-muted">Clicks</span>
            <span className="text-lg font-bold text-white">{ads.reduce((s, a) => s + a.clicks, 0).toLocaleString()}</span>
          </div>
          <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
            <span className="block text-xs text-continuum-muted">Spend</span>
            <span className="text-lg font-bold text-white">${(ads.reduce((s, a) => s + a.spend, 0) / 100).toFixed(2)}</span>
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
            {filter === 'all' ? 'No ads yet. Generate a Content Pack and hit \"Publish as Ad\" to get started!' : `No ${filter} ads.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAds.map(ad => (
            <div key={ad.id} className="p-4 rounded-xl bg-continuum-surface border border-continuum-border">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-white truncate">{ad.campaignName || 'Campaign'}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusBadge(ad.status)}`}>
                      {ad.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-continuum-muted line-clamp-2">{ad.content}</p>
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-4 gap-2 mt-3 mb-3">
                <div>
                  <span className="block text-[10px] text-continuum-muted">Impressions</span>
                  <span className="text-sm font-medium text-white">{ad.impressions.toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-continuum-muted">Clicks</span>
                  <span className="text-sm font-medium text-white">{ad.clicks.toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-continuum-muted">CTR</span>
                  <span className="text-sm font-medium text-white">{ad.ctr.toFixed(2)}%</span>
                </div>
                <div>
                  <span className="block text-[10px] text-continuum-muted">Spend</span>
                  <span className="text-sm font-medium text-white">${(ad.spend / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-continuum-border">
                {ad.status === 'ACTIVE' && (
                  <button
                    onClick={() => toggleAdStatus(ad.id, 'pause')}
                    className="px-3 py-1.5 rounded-lg text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                  >
                    Pause
                  </button>
                )}
                {ad.status === 'PAUSED' && (
                  <button
                    onClick={() => toggleAdStatus(ad.id, 'activate')}
                    className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => deleteAd(ad.id)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition ml-auto"
                >
                  Delete
                </button>
                <span className="text-[10px] text-continuum-muted">
                  Created {new Date(ad.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
