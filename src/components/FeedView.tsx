'use client'

import { useEffect } from 'react'
import { useFeed } from '@/lib/hooks'

const TYPE_LABELS: Record<string, string> = {
  reflection: 'Reflection',
  memory_echo: 'Memory',
  state_report: 'State',
  thread_update: 'Thread',
  prompt: 'Prompt',
}

const TYPE_COLORS: Record<string, string> = {
  reflection: 'text-purple-400',
  memory_echo: 'text-blue-400',
  state_report: 'text-green-400',
  thread_update: 'text-yellow-400',
  prompt: 'text-pink-400',
}

export default function FeedView() {
  const { items, loading, markSeen } = useFeed()

  // Mark all unseen items as seen when viewed
  useEffect(() => {
    const unseen = items.filter((i) => !i.seen).map((i) => i.id)
    if (unseen.length > 0) {
      markSeen(unseen)
    }
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-continuum-muted">
        Loading...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-continuum-muted px-8 text-center">
        <div>
          <p className="text-lg">Nothing here yet.</p>
          <p className="text-sm mt-1">
            Your feed builds over time as your AI learns about you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-3">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
    </div>
  )
}

function FeedCard({
  item,
}: {
  item: {
    id: string
    type: string
    content: string
    seen: boolean
    createdAt: string
  }
}) {
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  return (
    <div
      className={`p-4 rounded-xl border transition ${
        item.seen
          ? 'bg-continuum-surface border-continuum-border'
          : 'bg-continuum-surface border-continuum-accent/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium ${TYPE_COLORS[item.type] || 'text-continuum-muted'}`}>
          {TYPE_LABELS[item.type] || item.type}
        </span>
        <span className="text-xs text-continuum-muted">{timeAgo}</span>
      </div>
      <p className="text-sm text-continuum-text leading-relaxed">{item.content}</p>
    </div>
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
