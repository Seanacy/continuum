'use client'

import React from 'react'
import { useState, useEffect } from 'react'

// ============================================
// TYPES
// ============================================

interface Campaign {
  id: string
  name: string
  goal: string
  durationDays: number
  platforms: string[]
  startDate: string
  brief: any
  postsGenerated: boolean
  status: string
  postCount: number
  createdAt: string
}

interface CampaignManagerProps {
  projectId: string
  characters: { id: string; name: string; role: string }[]
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-300',
  active: 'bg-green-500/20 text-green-300',
  paused: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-blue-500/20 text-blue-300',
  cancelled: 'bg-red-500/20 text-red-300',
}

const PLATFORM_OPTIONS = ['twitter', 'instagram', 'linkedin', 'tiktok', 'youtube']

// ============================================
// COMPONENT
// ============================================

export default function OrbitCampaignManager({ projectId, characters }: CampaignManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [generatingPosts, setGeneratingPosts] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [campaignDetail, setCampaignDetail] = useState<any>(null)

  // Form state
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [durationDays, setDurationDays] = useState(7)
  const [platforms, setPlatforms] = useState<string[]>(['twitter'])
  const [startDate, setStartDate] = useState('')

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/orbit/${projectId}/campaigns`)
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCampaignDetail = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/orbit/${projectId}/campaigns?campaignId=${campaignId}`)
      if (res.ok) {
        const data = await res.json()
        setCampaignDetail(data)
      }
    } catch (err) {
      console.error('Failed to fetch campaign detail:', err)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [projectId])

  useEffect(() => {
    if (selectedCampaign) {
      fetchCampaignDetail(selectedCampaign)
    }
  }, [selectedCampaign])

  // ============================================
  // ACTIONS
  // ============================================

  const handleCreate = async () => {
    if (!name || !goal) return
    setCreating(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goal, durationDays, platforms, startDate: startDate || undefined }),
      })
      if (res.ok) {
        setShowCreate(false)
        setName('')
        setGoal('')
        setDurationDays(7)
        setPlatforms(['twitter'])
        setStartDate('')
        await fetchCampaigns()
      }
    } catch (err) {
      console.error('Failed to create campaign:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleGeneratePosts = async (campaignId: string) => {
    setGeneratingPosts(campaignId)
    try {
      const res = await fetch(`/api/orbit/${projectId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_posts', campaignId }),
      })
      if (res.ok) {
        await fetchCampaigns()
        if (selectedCampaign === campaignId) {
          await fetchCampaignDetail(campaignId)
        }
      }
    } catch (err) {
      console.error('Failed to generate posts:', err)
    } finally {
      setGeneratingPosts(null)
    }
  }

  const handleStatusUpdate = async (campaignId: string, status: string) => {
    try {
      await fetch(`/api/orbit/${projectId}/campaigns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, status }),
      })
      await fetchCampaigns()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleDelete = async (campaignId: string) => {
    try {
      await fetch(`/api/orbit/${projectId}/campaigns?campaignId=${campaignId}`, {
        method: 'DELETE',
      })
      if (selectedCampaign === campaignId) {
        setSelectedCampaign(null)
        setCampaignDetail(null)
      }
      await fetchCampaigns()
    } catch (err) {
      console.error('Failed to delete campaign:', err)
    }
  }

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="mt-6 p-6 rounded-xl" style={{ backgroundColor: '#14141f', border: '1px solid #1e1e2e' }}>
        <div className="animate-pulse text-center" style={{ color: '#71717a' }}>Loading campaigns...</div>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: '#e4e4e7' }}>Campaign Manager</h3>
          <p className="text-sm" style={{ color: '#71717a' }}>
            Coordinate content drops across your entire orbit
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: '#8b5cf6', color: '#fff' }}
        >
          {showCreate ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {/* CREATE FORM */}
      {showCreate && (
        <div className="p-5 rounded-xl space-y-4" style={{ backgroundColor: '#14141f', border: '1px solid #1e1e2e' }}>
          <h4 className="font-medium" style={{ color: '#e4e4e7' }}>Create Campaign</h4>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#71717a' }}>Campaign Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Product Launch Week"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e4e4e7' }}
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#71717a' }}>Campaign Goal</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="What do you want this campaign to achieve?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e4e4e7' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#71717a' }}>Duration (days)</label>
              <input
                type="number"
                value={durationDays}
                onChange={e => setDurationDays(Number(e.target.value))}
                min={1}
                max={90}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e4e4e7' }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: '#71717a' }}>Start Date (optional)</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e4e4e7' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#71717a' }}>Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: platforms.includes(p) ? '#8b5cf6' : '#1e1e2e',
                    color: platforms.includes(p) ? '#fff' : '#71717a',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs" style={{ color: '#71717a' }}>
              {characters.length} characters will participate
            </span>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !name || !goal}
            className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#6d28d9', color: '#fff' }}
          >
            {creating ? 'Generating Campaign Brief...' : 'Create Campaign'}
          </button>
        </div>
      )}

      {/* CAMPAIGN LIST */}
      {campaigns.length === 0 && !showCreate ? (
        <div className="p-8 rounded-xl text-center" style={{ backgroundColor: '#14141f', border: '1px solid #1e1e2e' }}>
          <p className="text-sm" style={{ color: '#71717a' }}>
            No campaigns yet. Create one to coordinate content across your orbit.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="p-4 rounded-xl cursor-pointer transition-colors"
              style={{
                backgroundColor: selectedCampaign === campaign.id ? '#1e1e2e' : '#14141f',
                border: `1px solid ${selectedCampaign === campaign.id ? '#8b5cf6' : '#1e1e2e'}`,
              }}
              onClick={() => setSelectedCampaign(selectedCampaign === campaign.id ? null : campaign.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium" style={{ color: '#e4e4e7' }}>{campaign.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[campaign.status] || STATUS_COLORS.draft}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: '#71717a' }}>{campaign.goal}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: '#71717a' }}>
                    <span>{campaign.durationDays} days</span>
                    <span>{campaign.platforms.join(', ')}</span>
                    {campaign.postsGenerated && <span className="text-green-400">Posts generated</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {!campaign.postsGenerated && campaign.brief && (
                    <button
                      onClick={e => { e.stopPropagation(); handleGeneratePosts(campaign.id) }}
                      disabled={generatingPosts === campaign.id}
                      className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: '#8b5cf6', color: '#fff' }}
                    >
                      {generatingPosts === campaign.id ? 'Generating...' : 'Generate Posts'}
                    </button>
                  )}
                  {campaign.status === 'draft' && (
                    <button
                      onClick={e => { e.stopPropagation(); handleStatusUpdate(campaign.id, 'active') }}
                      className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: '#059669', color: '#fff' }}
                    >
                      Activate
                    </button>
                  )}
                  {campaign.status === 'active' && (
                    <button
                      onClick={e => { e.stopPropagation(); handleStatusUpdate(campaign.id, 'paused') }}
                      className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: '#d97706', color: '#fff' }}
                    >
                      Pause
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(campaign.id) }}
                    className="px-3 py-1 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: '#dc2626', color: '#fff' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* EXPANDED DETAIL */}
              {selectedCampaign === campaign.id && campaignDetail && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid #1e1e2e' }}>
                  {/* Brief */}
                  {campaignDetail.brief && (
                    <div className="space-y-3">
                      <div>
                        <h5 className="text-sm font-medium mb-1" style={{ color: '#8b5cf6' }}>Theme</h5>
                        <p className="text-sm" style={{ color: '#e4e4e7' }}>{campaignDetail.brief.theme}</p>
                      </div>
                      <div>
                        <h5 className="text-sm font-medium mb-1" style={{ color: '#8b5cf6' }}>Narrative</h5>
                        <p className="text-sm" style={{ color: '#e4e4e7' }}>{campaignDetail.brief.narrative}</p>
                      </div>
                      {campaignDetail.brief.keyMessages && (
                        <div>
                          <h5 className="text-sm font-medium mb-1" style={{ color: '#8b5cf6' }}>Key Messages</h5>
                          <div className="flex flex-wrap gap-2">
                            {campaignDetail.brief.keyMessages.map((msg: string, i: number) => (
                              <span key={i} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: '#1e1e2e', color: '#e4e4e7' }}>
                                {msg}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {campaignDetail.brief.hashtags && (
                        <div>
                          <h5 className="text-sm font-medium mb-1" style={{ color: '#8b5cf6' }}>Hashtags</h5>
                          <div className="flex flex-wrap gap-2">
                            {campaignDetail.brief.hashtags.map((tag: string, i: number) => (
                              <span key={i} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: '#6d28d9', color: '#fff' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {campaignDetail.brief.timeline && (
                        <div>
                          <h5 className="text-sm font-medium mb-1" style={{ color: '#8b5cf6' }}>Timeline</h5>
                          <div className="space-y-1">
                            {campaignDetail.brief.timeline.map((t: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="px-2 py-0.5 rounded font-mono" style={{ backgroundColor: '#1e1e2e', color: '#8b5cf6' }}>
                                  Day {t.day}
                                </span>
                                <span style={{ color: '#e4e4e7' }}>{t.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Posts */}
                  {campaignDetail.posts && campaignDetail.posts.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium mb-2" style={{ color: '#8b5cf6' }}>
                        Generated Posts ({campaignDetail.posts.length})
                      </h5>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {campaignDetail.posts.map((post: any) => (
                          <div key={post.id} className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium" style={{ color: '#8b5cf6' }}>
                                {post.character?.name || 'Unknown'}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1e1e2e', color: '#71717a' }}>
                                {post.platform}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[post.status] || ''}`}>
                                {post.status}
                              </span>
                            </div>
                            <p style={{ color: '#e4e4e7' }}>{post.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
