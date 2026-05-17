'use client'

import { useState } from 'react'
import { useThreads } from '@/lib/hooks'

export default function ThreadsView({
  onOpenThread,
}: {
  onOpenThread: (threadId: string) => void
}) {
  const { threads, loading, updateStatus } = useThreads()
  const [filter, setFilter] = useState<'active' | 'paused' | 'resolved' | 'all'>('active')

  const filtered =
    filter === 'all'
      ? threads
      : threads.filter((t) => t.status === filter)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-continuum-muted">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['active', 'paused', 'resolved', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              filter === f
                ? 'bg-continuum-accent text-white'
                : 'bg-continuum-surface text-continuum-muted hover:text-continuum-text'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div className="text-center text-continuum-muted pt-10">
          <p>No {filter === 'all' ? '' : filter} threads.</p>
          <p className="text-xs mt-1">Threads are auto-created from your conversations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              onOpen={() => onOpenThread(thread.id)}
              onAction={(action) => updateStatus(thread.id, action)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ThreadCard({
  thread,
  onOpen,
  onAction,
}: {
  thread: {
    id: string
    title: string
    status: string
    summary: string | null
    updatedAt: string
    _count: { messages: number }
  }
  onOpen: () => void
  onAction: (action: string) => void
}) {
  const timeAgo = getTimeAgo(new Date(thread.updatedAt))

  const statusColors: Record<string, string> = {
    active: 'text-green-400',
    paused: 'text-yellow-400',
    resolved: 'text-continuum-muted',
  }

  return (
    <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border">
      <div className="flex items-start justify-between mb-2">
        <button
          onClick={onOpen}
          className="text-sm font-medium text-continuum-text hover:text-continuum-accent transition text-left"
        >
          {thread.title}
        </button>
        <span className={`text-xs ${statusColors[thread.status] || ''}`}>
          {thread.status}
        </span>
      </div>

      {thread.summary && (
        <p className="text-xs text-continuum-muted mb-2 leading-relaxed">
          {thread.summary}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-continuum-muted">
          {thread._count.messages} messages · {timeAgo}
        </span>

        <div className="flex gap-1">
          {thread.status === 'active' && (
            <>
              <ActionBtn label="Pause" onClick={() => onAction('pause')} />
              <ActionBtn label="Resolve" onClick={() => onAction('resolve')} />
            </>
          )}
          {thread.status === 'paused' && (
            <ActionBtn label="Resume" onClick={() => onAction('resume')} />
          )}
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 text-xs rounded bg-continuum-border text-continuum-muted hover:text-continuum-text transition"
    >
      {label}
    </button>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
