'use client'

import React from 'react'
import { useState, useEffect } from 'react'

// ============================================
// TYPES
// ============================================

interface EngagementScore {
  total: number
  rate: number
  virality: number
  sentiment: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
}

interface CharacterPerformance {
  characterId: string
  characterName: string
  roleType: string
  totalPosts: number
  publishedPosts: number
  avgEngagementScore: number
  totalViews: number
  totalLikes: number
  totalComments: number
  totalShares: number
  engagementRate: number
  topPost: { id: string; content: string; score: number } | null
  contentBreakdown: Record<string, number>
  platformBreakdown: Record<string, number>
  trend: 'up' | 'down' | 'stable'
  trendPercent: number
}

interface PlatformAnalytics {
  platform: string
  totalPosts: number
  avgEngagement: number
  bestContentType: string
  peakDay: string
  trend: 'up' | 'down' | 'stable'
}

interface ContentTypeAnalytics {
  contentType: string
  totalPosts: number
  avgEngagement: number
  avgViews: number
  topPlatform: string
  trend: 'up' | 'down' | 'stable'
}

interface CampaignAnalytics {
  campaignId: string
  campaignName: string
  totalPosts: number
  publishedPosts: number
  totalEngagement: number
  avgEngagementRate: number
  topPerformer: string
  characterBreakdown: { name: string; posts: number; engagement: number }[]
}

interface AnalyticsSummary {
  overview: {
    totalPosts: number
    publishedPosts: number
    totalEngagement: number
    avgEngagementRate: number
    totalReach: number
    activeCharacters: number
    activeCampaigns: number
    bestDay: string
  }
  characterPerformance: CharacterPerformance[]
  platformAnalytics: PlatformAnalytics[]
  contentTypeAnalytics: ContentTypeAnalytics[]
  campaignAnalytics: CampaignAnalytics[]
  recentTrends: {
    period: string
    engagementChange: number
    reachChange: number
    postFrequencyChange: number
  }
  aiInsights: string[]
}

interface DashboardProps {
  projectId: string
}

// ============================================
// HELPER COMPONENTS
// ============================================

function Gradebadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    S: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    A: 'bg-green-500/20 text-green-400 border-green-500/30',
    B: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    C: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    D: 'bg-red-500/20 text-red-400 border-red-500/30',
    F: 'bg-red-800/20 text-red-500 border-red-800/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${colors[grade] || colors.C}`}>
      {grade}
    </span>
  )
}

function TrendIndicator({ trend, percent }: { trend: string; percent: number }) {
  if (trend === 'up') return <span className="text-green-400 text-sm">+{percent}%</span>
  if (trend === 'down') return <span className="text-red-400 text-sm">{percent}%</span>
  return <span className="text-[#71717a] text-sm">--</span>
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: React.ReactNode }) {
  return (
    <div className="bg-[#14141f] border border-[#1e1e2e] rounded-lg p-4">
      <div className="text-[#71717a] text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[#e4e4e7] text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  )
}

function BarChart({ items, maxVal }: { items: { label: string; value: number; color?: string }[]; maxVal: number }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-24 text-xs text-[#71717a] truncate">{item.label}</div>
          <div className="flex-1 h-5 bg-[#0a0a0f] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${maxVal > 0 ? Math.round((item.value / maxVal) * 100) : 0}%`,
                backgroundColor: item.color || '#8b5cf6',
              }}
            />
          </div>
          <div className="w-12 text-xs text-[#e4e4e7] text-right">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function OrbitAnalyticsDashboard({ projectId }: DashboardProps) {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'characters' | 'platforms' | 'campaigns'>('overview')
  const [seeding, setSeeding] = useState(false)
  const [loadingInsights, setLoadingInsights] = useState(false)

  const fetchData = async (withInsights = false) => {
    try {
      setLoading(true)
      const url = `/api/orbit/${projectId}/analytics${withInsights ? '?insights=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch analytics')
      const json = await res.json()
      setData(json)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [projectId])

  const handleSeedDemo = async () => {
    try {
      setSeeding(true)
      const res = await fetch(`/api/orbit/${projectId}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_demo' }),
      })
      if (!res.ok) throw new Error('Failed to seed')
      const json = await res.json()
      alert(`Seeded engagement data for ${json.seeded} posts`)
      fetchData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSeeding(false)
    }
  }

  const handleGetInsights = async () => {
    try {
      setLoadingInsights(true)
      const res = await fetch(`/api/orbit/${projectId}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'insights' }),
      })
      if (!res.ok) throw new Error('Failed to get insights')
      const json = await res.json()
      if (data) {
        setData({ ...data, aiInsights: json.insights })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingInsights(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-8 text-center">
        <div className="text-[#71717a]">Loading analytics...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#14141f] border border-red-500/30 rounded-xl p-8 text-center">
        <div className="text-red-400">{error}</div>
        <button onClick={() => fetchData()} className="mt-3 px-4 py-2 bg-[#8b5cf6] text-white rounded-lg text-sm">
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const { overview, characterPerformance, platformAnalytics, contentTypeAnalytics, campaignAnalytics, recentTrends, aiInsights } = data

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'characters' as const, label: 'Characters' },
    { id: 'platforms' as const, label: 'Platforms' },
    { id: 'campaigns' as const, label: 'Campaigns' },
  ]

  return (
    <div className="space-y-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#e4e4e7]">Performance Analytics</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="px-3 py-1.5 text-xs bg-[#1e1e2e] text-[#71717a] rounded-lg hover:text-[#e4e4e7] transition-colors disabled:opacity-50"
          >
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
          <button
            onClick={handleGetInsights}
            disabled={loadingInsights}
            className="px-3 py-1.5 text-xs bg-[#6d28d9] text-white rounded-lg hover:bg-[#8b5cf6] transition-colors disabled:opacity-50"
          >
            {loadingInsights ? 'Thinking...' : 'AI Insights'}
          </button>
          <button
            onClick={() => fetchData()}
            className="px-3 py-1.5 text-xs bg-[#1e1e2e] text-[#71717a] rounded-lg hover:text-[#e4e4e7] transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* AI Insights Banner */}
      {aiInsights.length > 0 && (
        <div className="bg-[#6d28d9]/10 border border-[#8b5cf6]/30 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-[#8b5cf6] mb-2 font-bold">AI Insights</div>
          <div className="space-y-2">
            {aiInsights.map((insight, i) => (
              <div key={i} className="text-sm text-[#e4e4e7] flex gap-2">
                <span className="text-[#8b5cf6] shrink-0">{i + 1}.</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0a0a0f] rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-[#8b5cf6] text-white'
                : 'text-[#71717a] hover:text-[#e4e4e7]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Posts" value={overview.totalPosts} sub={<span className="text-xs text-[#71717a]">{overview.publishedPosts} published</span>} />
            <StatCard label="Engagement" value={overview.totalEngagement.toLocaleString()} sub={<TrendIndicator trend={recentTrends.engagementChange > 0 ? 'up' : recentTrends.engagementChange < 0 ? 'down' : 'stable'} percent={recentTrends.engagementChange} />} />
            <StatCard label="Avg Rate" value={`${overview.avgEngagementRate}`} sub={<span className="text-xs text-[#71717a]">per post</span>} />
            <StatCard label="Reach" value={overview.totalReach.toLocaleString()} sub={<TrendIndicator trend={recentTrends.reachChange > 0 ? 'up' : recentTrends.reachChange < 0 ? 'down' : 'stable'} percent={recentTrends.reachChange} />} />
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Characters" value={overview.activeCharacters} />
            <StatCard label="Campaigns" value={overview.activeCampaigns} />
            <StatCard label="Best Day" value={overview.bestDay} />
          </div>

          {/* 7d Trends */}
          <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-[#71717a] mb-3 font-bold">7-Day Trends</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[#71717a] text-xs">Engagement</div>
                <div className="text-lg font-bold">
                  <TrendIndicator
                    trend={recentTrends.engagementChange > 0 ? 'up' : recentTrends.engagementChange < 0 ? 'down' : 'stable'}
                    percent={recentTrends.engagementChange}
                  />
                </div>
              </div>
              <div>
                <div className="text-[#71717a] text-xs">Reach</div>
                <div className="text-lg font-bold">
                  <TrendIndicator
                    trend={recentTrends.reachChange > 0 ? 'up' : recentTrends.reachChange < 0 ? 'down' : 'stable'}
                    percent={recentTrends.reachChange}
                  />
                </div>
              </div>
              <div>
                <div className="text-[#71717a] text-xs">Post Frequency</div>
                <div className="text-lg font-bold">
                  <TrendIndicator
                    trend={recentTrends.postFrequencyChange > 0 ? 'up' : recentTrends.postFrequencyChange < 0 ? 'down' : 'stable'}
                    percent={recentTrends.postFrequencyChange}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Content Type Breakdown */}
          {contentTypeAnalytics.length > 0 && (
            <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-[#71717a] mb-3 font-bold">Content Performance</div>
              <BarChart
                items={contentTypeAnalytics.map(ct => ({
                  label: ct.contentType,
                  value: ct.avgEngagement,
                  color: '#8b5cf6',
                }))}
                maxVal={Math.max(...contentTypeAnalytics.map(ct => ct.avgEngagement), 1)}
              />
            </div>
          )}
        </div>
      )}

      {/* CHARACTERS TAB */}
      {activeTab === 'characters' && (
        <div className="space-y-3">
          {characterPerformance.length === 0 ? (
            <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-8 text-center text-[#71717a]">
              No character data yet
            </div>
          ) : (
            characterPerformance
              .sort((a, b) => b.avgEngagementScore - a.avgEngagementScore)
              .map((char, i) => (
                <div key={char.characterId} className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center text-[#8b5cf6] font-bold text-sm">
                        #{i + 1}
                      </div>
                      <div>
                        <div className="text-[#e4e4e7] font-medium">{char.characterName}</div>
                        <div className="text-[#71717a] text-xs">{char.roleType}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <TrendIndicator trend={char.trend} percent={char.trendPercent} />
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div>
                      <div className="text-[#71717a] text-xs">Posts</div>
                      <div className="text-[#e4e4e7] font-bold">{char.totalPosts}</div>
                    </div>
                    <div>
                      <div className="text-[#71717a] text-xs">Views</div>
                      <div className="text-[#e4e4e7] font-bold">{char.totalViews.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[#71717a] text-xs">Likes</div>
                      <div className="text-[#e4e4e7] font-bold">{char.totalLikes.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[#71717a] text-xs">Comments</div>
                      <div className="text-[#e4e4e7] font-bold">{char.totalComments.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[#71717a] text-xs">Eng Rate</div>
                      <div className="text-[#e4e4e7] font-bold">{char.engagementRate}%</div>
                    </div>
                  </div>

                  {/* Platform breakdown bar */}
                  {Object.keys(char.platformBreakdown).length > 0 && (
                    <div className="mt-3">
                      <BarChart
                        items={Object.entries(char.platformBreakdown).map(([plat, count]) => ({
                          label: plat,
                          value: count as number,
                          color: plat === 'twitter' ? '#1DA1F2' : plat === 'instagram' ? '#E1306C' : plat === 'tiktok' ? '#00f2ea' : plat === 'linkedin' ? '#0A66C2' : '#8b5cf6',
                        }))}
                        maxVal={Math.max(...Object.values(char.platformBreakdown) as number[], 1)}
                      />
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}

      {/* PLATFORMS TAB */}
      {activeTab === 'platforms' && (
        <div className="space-y-3">
          {platformAnalytics.length === 0 ? (
            <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-8 text-center text-[#71717a]">
              No platform data yet
            </div>
          ) : (
            <>
              <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-[#71717a] mb-3 font-bold">Posts by Platform</div>
                <BarChart
                  items={platformAnalytics.map(p => ({
                    label: p.platform,
                    value: p.totalPosts,
                    color: p.platform === 'twitter' ? '#1DA1F2' : p.platform === 'instagram' ? '#E1306C' : p.platform === 'tiktok' ? '#00f2ea' : p.platform === 'linkedin' ? '#0A66C2' : '#8b5cf6',
                  }))}
                  maxVal={Math.max(...platformAnalytics.map(p => p.totalPosts), 1)}
                />
              </div>

              <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-[#71717a] mb-3 font-bold">Avg Engagement by Platform</div>
                <BarChart
                  items={platformAnalytics.map(p => ({
                    label: p.platform,
                    value: p.avgEngagement,
                    color: p.platform === 'twitter' ? '#1DA1F2' : p.platform === 'instagram' ? '#E1306C' : p.platform === 'tiktok' ? '#00f2ea' : p.platform === 'linkedin' ? '#0A66C2' : '#8b5cf6',
                  }))}
                  maxVal={Math.max(...platformAnalytics.map(p => p.avgEngagement), 1)}
                />
              </div>

              {/* Platform detail cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {platformAnalytics.map(p => (
                  <div key={p.platform} className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
                    <div className="text-[#e4e4e7] font-medium capitalize mb-2">{p.platform}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-[#71717a]">Best Type: </span>
                        <span className="text-[#e4e4e7]">{p.bestContentType}</span>
                      </div>
                      <div>
                        <span className="text-[#71717a]">Peak Day: </span>
                        <span className="text-[#e4e4e7]">{p.peakDay}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* CAMPAIGNS TAB */}
      {activeTab === 'campaigns' && (
        <div className="space-y-3">
          {campaignAnalytics.length === 0 ? (
            <div className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-8 text-center text-[#71717a]">
              No campaign data yet
            </div>
          ) : (
            campaignAnalytics.map(camp => (
              <div key={camp.campaignId} className="bg-[#14141f] border border-[#1e1e2e] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[#e4e4e7] font-medium">{camp.campaignName}</div>
                  <div className="text-xs text-[#71717a]">{camp.publishedPosts}/{camp.totalPosts} published</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <div className="text-[#71717a] text-xs">Total Engagement</div>
                    <div className="text-[#e4e4e7] font-bold">{camp.totalEngagement.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[#71717a] text-xs">Avg Rate</div>
                    <div className="text-[#e4e4e7] font-bold">{camp.avgEngagementRate}</div>
                  </div>
                  <div>
                    <div className="text-[#71717a] text-xs">Top Performer</div>
                    <div className="text-[#8b5cf6] font-bold">{camp.topPerformer}</div>
                  </div>
                </div>

                {/* Character breakdown */}
                {camp.characterBreakdown.length > 0 && (
                  <BarChart
                    items={camp.characterBreakdown.map(cb => ({
                      label: cb.name,
                      value: cb.engagement,
                      color: '#8b5cf6',
                    }))}
                    maxVal={Math.max(...camp.characterBreakdown.map(cb => cb.engagement), 1)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
