'use client'

import { useEffect, useState } from 'react'
import { useFeed } from '@/lib/hooks'
import { trackInteraction } from '@/lib/interaction-tracker'

const TYPE_LABELS: Record<string, string> = {
  reflection: 'Reflection',
  memory_echo: 'Memory',
  state_report: 'State',
  thread_update: 'Thread',
  prompt: 'Prompt',
  social_pick: 'Found for you',
  creative_writing: 'Emily wrote this',
  daily_brief: 'Your Day',
  curated_find: 'Emily found this',
  video_script: 'Emily imagined this',
}

const TYPE_COLORS: Record<string, string> = {
  reflection: 'text-purple-400',
  memory_echo: 'text-blue-400',
  state_report: 'text-green-400',
  thread_update: 'text-yellow-400',
  prompt: 'text-pink-400',
  social_pick: 'text-cyan-400',
  creative_writing: 'text-rose-400',
  daily_brief: 'text-amber-400',
  curated_find: 'text-teal-400',
  video_script: 'text-indigo-400',
}

const SOURCE_ICONS: Record<string, string> = {
  reddit: '💬',
  twitter: '🐦',
  youtube: '▶️',
  github: '💻',
  news: '📰',
}

interface SocialPickData {
  title: string
  url: string
  source: string
  snippet: string
  commentary: string
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
      {items.map((item) => {
        switch (item.type) {
          case 'social_pick':
            return <SocialCard key={item.id} item={item} />
          case 'creative_writing':
            return <CreativeWritingCard key={item.id} item={item} />
          case 'daily_brief':
            return <DailyBriefCard key={item.id} item={item} />
          case 'curated_find':
            return <CuratedFindCard key={item.id} item={item} />
          case 'video_script':
            return <VideoScriptCard key={item.id} item={item} />
          default:
            return <FeedCard key={item.id} item={item} />
        }
      })}
    </div>
  )
}

// ============================================
// Social Pick Card — link preview style
// ============================================
function SocialCard({
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

  // Parse the JSON content
  let pick: SocialPickData | null = null
  try {
    pick = JSON.parse(item.content)
  } catch {
    // Fallback to regular card if parsing fails
    return <FeedCard item={item} />
  }

  if (!pick) return <FeedCard item={item} />

  const sourceIcon = SOURCE_ICONS[pick.source] || '🌐'
  const sourceName = pick.source.charAt(0).toUpperCase() + pick.source.slice(1)

  return (
    <div
      className={`rounded-xl border overflow-hidden transition ${
        item.seen
          ? 'bg-continuum-surface border-continuum-border'
          : 'bg-continuum-surface border-cyan-500/30'
      }`}
    >
      {/* Emily's commentary */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-cyan-400">Found for you</span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        <p className="text-sm text-continuum-text leading-relaxed italic">
          &ldquo;{pick.commentary}&rdquo;
        </p>
      </div>

      {/* Link preview card */}
      <a
        href={pick.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type, source: pick.source })}
        className="block mx-3 mb-3 rounded-lg border border-continuum-border bg-continuum-bg hover:border-continuum-accent/50 transition overflow-hidden"
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">{sourceIcon}</span>
            <span className="text-xs text-continuum-muted">{sourceName}</span>
          </div>
          <p className="text-sm font-medium text-continuum-text leading-snug line-clamp-2">
            {pick.title}
          </p>
          {pick.snippet && (
            <p className="text-xs text-continuum-muted mt-1 leading-relaxed line-clamp-2">
              {pick.snippet}
            </p>
          )}
        </div>
      </a>
    </div>
  )
}

// ============================================
// Regular Feed Card
// ============================================
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
      onClick={() => trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type })}
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

// ============================================
// Item type for all cards
// ============================================
type FeedItem = {
  id: string
  type: string
  content: string
  seen: boolean
  createdAt: string
}

// ============================================
// Creative Writing Card — poems, stories, prompts, letters
// ============================================
function CreativeWritingCard({ item }: { item: FeedItem }) {
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: { title?: string; body?: string; format?: string; reason?: string; tags?: string[] } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.body) return <FeedCard item={item} />

  const formatLabel: Record<string, string> = {
    poem: '✨ Poem',
    micro_story: '📖 Story',
    thought_experiment: '🧠 What if...',
    journal_prompt: '📝 Journal Prompt',
    letter: '💌 Letter',
  }

  return (
    <div
      onClick={() => trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type })}
      className={`rounded-xl border overflow-hidden transition ${
        item.seen ? 'bg-continuum-surface border-continuum-border' : 'bg-continuum-surface border-rose-500/30'
      }`}
    >
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-rose-400">
            {formatLabel[data.format || ''] || 'Emily wrote this'}
          </span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        {data.title && (
          <p className="text-sm font-semibold text-continuum-text mb-1.5">{data.title}</p>
        )}
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-continuum-text leading-relaxed whitespace-pre-line">{data.body}</p>
      </div>
      {data.reason && (
        <div className="px-4 pb-3 pt-1 border-t border-continuum-border/50">
          <p className="text-xs text-continuum-muted italic">{data.reason}</p>
        </div>
      )}
      {data.tags && data.tags.length > 0 && (
        <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
          {data.tags.map((tag, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Daily Brief Card — personalized morning update
// ============================================
function DailyBriefCard({ item }: { item: FeedItem }) {
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: { title?: string; body?: string; reason?: string; tags?: string[] } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.body) return <FeedCard item={item} />

  // Body might be a string with bullet-style items separated by newlines
  const lines = data.body.split('\n').map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)

  return (
    <div
      onClick={() => trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type })}
      className={`rounded-xl border overflow-hidden transition ${
        item.seen ? 'bg-continuum-surface border-continuum-border' : 'bg-continuum-surface border-amber-500/30'
      }`}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-amber-400">☀️ {data.title || 'Your Day'}</span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-amber-400/60 text-xs mt-0.5">›</span>
              <p className="text-sm text-continuum-text leading-relaxed">{line}</p>
            </div>
          ))}
        </div>
      </div>
      {data.reason && (
        <div className="px-4 pb-3 pt-1 border-t border-continuum-border/50">
          <p className="text-xs text-continuum-muted italic">{data.reason}</p>
        </div>
      )}
    </div>
  )
}

// ============================================
// Curated Find Card — Emily's recommendation
// ============================================
function CuratedFindCard({ item }: { item: FeedItem }) {
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: { title?: string; body?: string; reason?: string; tags?: string[] } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.body) return <FeedCard item={item} />

  return (
    <div
      onClick={() => trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type })}
      className={`rounded-xl border overflow-hidden transition ${
        item.seen ? 'bg-continuum-surface border-continuum-border' : 'bg-continuum-surface border-teal-500/30'
      }`}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-teal-400">🔍 Emily found this</span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        {data.title && (
          <p className="text-sm font-semibold text-continuum-text mb-1">{data.title}</p>
        )}
        <p className="text-sm text-continuum-text leading-relaxed">{data.body}</p>
      </div>
      {data.reason && (
        <div className="px-4 pb-3 pt-1 border-t border-continuum-border/50">
          <p className="text-xs text-continuum-muted italic">💡 {data.reason}</p>
        </div>
      )}
      {data.tags && data.tags.length > 0 && (
        <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
          {data.tags.map((tag, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Video Script Card — storyboard view (Pro)
// ============================================
function VideoScriptCard({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false)
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: {
    title?: string; mood?: string; style?: string; totalDuration?: number;
    scenes?: Array<{ sceneNumber: number; duration: number; visualPrompt: string; narration: string }>;
    narrationFull?: string; reason?: string
  } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.title || !data?.scenes) return <FeedCard item={item} />

  return (
    <div
      onClick={() => {
        trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type })
        setExpanded(!expanded)
      }}
      className={`rounded-xl border overflow-hidden transition cursor-pointer ${
        item.seen ? 'bg-continuum-surface border-continuum-border' : 'bg-continuum-surface border-indigo-500/30'
      }`}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-400">🎬 Script</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">PRO</span>
          </div>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        <p className="text-sm font-semibold text-continuum-text">{data.title}</p>
        <div className="flex gap-2 mt-1">
          {data.mood && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300">{data.mood}</span>
          )}
          {data.style && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300">{data.style}</span>
          )}
          {data.totalDuration && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300">{data.totalDuration}s</span>
          )}
        </div>
      </div>

      {/* Narration preview */}
      <div className="px-4 pb-2">
        <p className="text-sm text-continuum-text leading-relaxed italic">
          &ldquo;{data.narrationFull}&rdquo;
        </p>
      </div>

      {/* Expandable scenes */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-continuum-border/50 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-continuum-muted font-medium">Storyboard</p>
          {data.scenes.map((scene) => (
            <div key={scene.sceneNumber} className="pl-3 border-l-2 border-indigo-500/30">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-medium text-indigo-400">Scene {scene.sceneNumber}</span>
                <span className="text-[10px] text-continuum-muted">{scene.duration}s</span>
              </div>
              <p className="text-xs text-continuum-muted leading-relaxed">{scene.visualPrompt}</p>
              <p className="text-xs text-continuum-text mt-0.5 italic">&ldquo;{scene.narration}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {!expanded && data.scenes.length > 0 && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-continuum-muted">Tap to see {data.scenes.length}-scene storyboard →</p>
        </div>
      )}

      {data.reason && (
        <div className="px-4 pb-3 pt-1 border-t border-continuum-border/50">
          <p className="text-xs text-continuum-muted italic">{data.reason}</p>
        </div>
      )}
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
