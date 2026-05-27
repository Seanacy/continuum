'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================
// TYPES
// ============================================

interface QueueItem {
  id: string
  characterName: string
  characterRole: string
  platform: string
  contentType: string
  content: string
  scheduledFor: string
  status: 'pending' | 'approved' | 'rejected' | 'posted'
  createdAt: string
}

interface AutomationStatus {
  totalGenerated: number
  pendingApproval: number
  approved: number
  rejected: number
  posted: number
  lastGeneratedAt: string | null
  characterBreakdown: {
    name: string
    role: string
    pending: number
    approved: number
    total: number
  }[]
}

interface OrbitAutomationPanelProps {
  projectId: string
  characters: {
    id: string
    name: string
    roleType: string
    username: string
  }[]
}

// ============================================
// COMPONENT
// ============================================

export default function OrbitAutomationPanel({ projectId, characters }: OrbitAutomationPanelProps) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [error, setError] = useState('')
  const [bulkApproving, setBulkApproving] = useState(false)

  // ----------------------------------------
  // Fetch queue and status
  // ----------------------------------------
  const fetchData = useCallback(async () => {
    try {
      const [queueRes, statusRes] = await Promise.all([
        fetch(`/api/orbit/${projectId}/automation`),
        fetch(`/api/orbit/${projectId}/automation?action=status`)
      ])
      if (queueRes.ok) {
        const qData = await queueRes.json()
        setQueue(qData.queue || [])
      }
      if (statusRes.ok) {
        const sData = await statusRes.json()
        setStatus(sData)
      }
    } catch (err) {
      console.error('Failed to fetch automation data:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ----------------------------------------
  // Generate a week of content
  // ----------------------------------------
  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/orbit/${projectId}/automation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          config: { daysAhead: 7, autoSchedule: true, autoApprove: false }
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchData()
    } catch (err: any) {
      setError(err.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ----------------------------------------
  // Approve / Reject single item
  // ----------------------------------------
  const handleAction = async (contentId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/orbit/${projectId}/automation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, contentId })
      })
      if (res.ok) {
        setQueue(prev => prev.map(item =>
          item.id === contentId ? { ...item, status: action === 'approve' ? 'approved' : 'rejected' } : item
        ))
        if (status) {
          setStatus({
            ...status,
            pendingApproval: status.pendingApproval - 1,
            approved: action === 'approve' ? status.approved + 1 : status.approved,
            rejected: action === 'reject' ? status.rejected + 1 : status.rejected
          })
        }
      }
    } catch (err) {
      console.error('Action failed:', err)
    }
  }

  // ----------------------------------------
  // Bulk approve all pending
  // ----------------------------------------
  const handleBulkApprove = async () => {
    setBulkApproving(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/automation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-approve' })
      })
      if (res.ok) {
        await fetchData()
      }
    } catch (err) {
      console.error('Bulk approve failed:', err)
    } finally {
      setBulkApproving(false)
    }
  }

  // ----------------------------------------
  // Filter queue
  // ----------------------------------------
  const filteredQueue = filter === 'all'
    ? queue
    : queue.filter(item => item.status === filter)

  const pendingCount = queue.filter(q => q.status === 'pending').length

  // ----------------------------------------
  // RENDER
  // ----------------------------------------

  if (loading) {
    return (
      <div className="mt-6 p-6 bg-continuum-surface rounded-xl border border-continuum-border">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-continuum-accent border-t-transparent rounded-full" />
          <span className="ml-3 text-continuum-muted text-sm">Loading automation...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {/* HEADER + GENERATE BUTTON */}
      <div className="p-6 bg-continuum-surface rounded-xl border border-continuum-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-continuum-text">Automation Engine</h3>
            <p className="text-sm text-continuum-muted mt-1">
              Generate a week of content for all characters, then approve or reject before publishing.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-continuum-accent hover:bg-continuum-accent-dim text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Generating...
              </span>
            ) : (
              'Generate Week'
            )}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {/* STATUS CARDS */}
        {status && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: status.totalGenerated, color: 'text-continuum-text' },
              { label: 'Pending', value: status.pendingApproval, color: 'text-yellow-400' },
              { label: 'Approved', value: status.approved, color: 'text-green-400' },
              { label: 'Rejected', value: status.rejected, color: 'text-red-400' },
              { label: 'Posted', value: status.posted, color: 'text-blue-400' },
            ].map(card => (
              <div key={card.label} className="p-3 bg-continuum-bg rounded-lg border border-continuum-border text-center">
                <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-xs text-continuum-muted mt-1">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* CHARACTER BREAKDOWN */}
        {status && status.characterBreakdown && status.characterBreakdown.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-continuum-muted">By Character</h4>
            {status.characterBreakdown.map(char => (
              <div key={char.name} className="flex items-center justify-between p-2 bg-continuum-bg rounded-lg border border-continuum-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-continuum-text">{char.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-continuum-accent/20 text-continuum-accent rounded-full">{char.role}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-yellow-400">{char.pending} pending</span>
                  <span className="text-green-400">{char.approved} approved</span>
                  <span className="text-continuum-muted">{char.total} total</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PUBLISHING QUEUE */}
      {queue.length > 0 && (
        <div className="p-6 bg-continuum-surface rounded-xl border border-continuum-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-continuum-text">Publishing Queue</h3>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <button
                  onClick={handleBulkApprove}
                  disabled={bulkApproving}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  {bulkApproving ? 'Approving...' : `Approve All (${pendingCount})`}
                </button>
              )}
            </div>
          </div>

          {/* FILTER TABS */}
          <div className="flex gap-2 mb-4">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-continuum-accent text-white'
                    : 'bg-continuum-bg text-continuum-muted hover:text-continuum-text border border-continuum-border'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-[10px]">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* QUEUE ITEMS */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredQueue.length === 0 ? (
              <p className="text-center text-continuum-muted text-sm py-4">
                No {filter === 'all' ? '' : filter} items in queue
              </p>
            ) : (
              filteredQueue.map(item => (
                <div key={item.id} className="p-4 bg-continuum-bg rounded-lg border border-continuum-border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-continuum-text">{item.characterName}</span>
                      <span className="text-xs px-2 py-0.5 bg-continuum-accent/20 text-continuum-accent rounded-full">
                        {item.characterRole}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                        {item.platform}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      item.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      item.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="text-xs text-continuum-muted mb-2">
                    {item.contentType} | Scheduled: {new Date(item.scheduledFor).toLocaleDateString()}
                  </div>

                  <p className="text-sm text-continuum-text/80 line-clamp-3 mb-3">
                    {item.content}
                  </p>

                  {item.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(item.id, 'approve')}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(item.id, 'reject')}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {queue.length === 0 && !loading && (
        <div className="p-8 bg-continuum-surface rounded-xl border border-continuum-border text-center">
          <div className="text-3xl mb-3">🤖</div>
          <h3 className="text-continuum-text font-medium mb-1">No content in queue</h3>
          <p className="text-sm text-continuum-muted mb-4">
            Click "Generate Week" to create a batch of posts for all your characters.
          </p>
        </div>
      )}
    </div>
  )
}
