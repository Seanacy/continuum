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
  echo_connection: 'Echo Match',
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
  echo_connection: 'text-violet-400',
}

const SOURCE_ICONS: Record<string, string> = {
  reddit: '\u{1F4AC}',
  twitter: '\u{1F426}',
  youtube: '\u25B6{'\uFE0F'}',
  github: '\u{1F4BB}',
  news: '\u{1F4F0}',
}

interface SocialPickData {
  title: string
  url: string
  source: string
  snippet: string
  commentary: string
}

interface CollabProposal {
  id: string
  title: string
  description: string
  option_a: string
  option_b: string
  votes_a: number
  votes_b: number
  status: string
  created_at: string
  user_a_name: string
  user_b_name: string
}

export default function FeedView() {
  const { items, loading, markSeen } = useFeed()
  const [cookingCount, setCookingCount] = useState(0)
  const [showCooking, setShowCooking] = useState(false)

  // Check for active collabs
  useEffect(() => {
    fetch('/api/collabs?status=cooking')
      .then(r => r.json())
      .then(data => {
        if (data.cookingCount !== undefined) setCookingCount(data.cookingCount)
        else if (data.collabs) setCookingCount(data.collabs.length)
      })
      .catch(() => {})
  }, [])

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

  // Show the cooking view
  if (showCooking) {
    return <WhatsCookingView onBack={() => setShowCooking(false)} />
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {cookingCount > 0 && (
          <CookingButton count={cookingCount} onClick={() => setShowCooking(true)} />
        )}
        <div className="flex items-center justify-center flex-1 text-continuum-muted px-8 text-center">
          <div>
            <p className="text-lg">Nothing here yet.</p>
            <p className="text-sm mt-1">
              Your feed builds over time as your AI learns about you.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-3">
      {cookingCount > 0 && (
        <CookingButton count={cookingCount} onClick={() => setShowCooking(true)} />
      )}
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
          case 'echo_connection':
            return <EchoConnectionCard key={item.id} item={item} />
          default:
            return <FeedCard key={item.id} item={item} />
        }
      })}
    </div>
  )
}

// ============================================
// What's Cooking Button — shows at top of feed
// ============================================
function CookingButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 hover:border-orange-500/50 transition flex items-center justify-between group"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{'\u{1F373}'}</span>
        <span className="text-sm font-medium text-orange-300 group-hover:text-orange-200 transition">
          What&apos;s Cooking
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-medium">
          {count} active
        </span>
        <span className="text-orange-400 text-xs">{'\u2192'}</span>
      </div>
    </button>
  )
}

// ============================================
// What's Cooking View — shows active collabs with voting
// ============================================
function WhatsCookingView({ onBack }: { onBack: () => void }) {
  const [collabs, setCollabs] = useState<CollabProposal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/collabs?status=cooking')
      .then(r => r.json())
      .then(data => {
        setCollabs(data.collabs || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-continuum-muted hover:text-continuum-text transition text-sm"
        >
          {'\u2190'} Feed
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">{'\u{1F373}'}</span>
          <h2 className="text-lg font-semibold text-continuum-text">What&apos;s Cooking</h2>
        </div>
      </div>

      <p className="text-xs text-continuum-muted mb-4">
        Collaborations being cooked up between creators. Vote on which direction they should go!
      </p>

      {loading ? (
        <div className="text-center text-continuum-muted py-8">Loading collabs...</div>
      ) : collabs.length === 0 ? (
        <div className="text-center text-continuum-muted py-8">
          <p>Nothing cooking right now.</p>
          <p className="text-xs mt-1">Check back soon!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {collabs.map(collab => (
            <CollabCard key={collab.id} collab={collab} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Collab Card — vote on a collaboration direction
// ============================================
function CollabCard({ collab }: { collab: CollabProposal }) {
  const [votesA, setVotesA] = useState(collab.votes_a)
  const [votesB, setVotesB] = useState(collab.votes_b)
  const [voted, setVoted] = useState(false)
  const [voting, setVoting] = useState(false)
  const totalVotes = votesA + votesB
  const timeAgo = getTimeAgo(new Date(collab.created_at))

  const handleVote = async (choice: 'a' | 'b') => {
    if (voted || voting) return
    setVoting(true)

    // Simple fingerprint for anonymous dedup
    const fp = btoa(navigator.userAgent + screen.width + screen.height).slice(0, 20)

    try {
      const res = await fetch('/api/collabs/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: collab.id, choice, fingerprint: fp }),
      })
      const data = await res.json()
      if (res.ok) {
        setVotesA(data.votesA)
        setVotesB(data.votesB)
        setVoted(true)
      } else if (res.status === 409) {
        // Already voted
        setVoted(true)
      }
    } catch { /* silent */ }
    setVoting(false)
  }

  const pctA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 50
  const pctB = totalVotes > 0 ? Math.round((votesB / totalVotes) * 100) : 50

  return (
    <div className="rounded-xl border border-orange-500/20 bg-continuum-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-orange-400 font-medium">
            {collab.user_a_name} {'\u00D7'} {collab.user_b_name}
          </span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        <p className="text-sm font-semibold text-continuum-text">{collab.title}</p>
        <p className="text-xs text-continuum-muted mt-1 leading-relaxed">{collab.description}</p>
      </div>

      {/* Vote buttons or results */}
      <div className="px-4 pb-3 space-y-2">
        <VoteOption
          label={collab.option_a}
          pct={pctA}
          votes={votesA}
          voted={voted}
          isWinning={votesA > votesB}
          onClick={() => handleVote('a')}
          disabled={voting || voted}
          color="orange"
        />
        <VoteOption
          label={collab.option_b}
          pct={pctB}
          votes={votesB}
          voted={voted}
          isWinning={votesB > votesA}
          onClick={() => handleVote('b')}
          disabled={voting || voted}
          color="amber"
        />
        {totalVotes > 0 && (
          <p className="text-[10px] text-continuum-muted text-center pt-1">
            {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================
// Vote Option — single vote bar
// ============================================
function VoteOption({
  label, pct, votes, voted, isWinning, onClick, disabled, color,
}: {
  label: string; pct: number; votes: number; voted: boolean;
  isWinning: boolean; onClick: () => void; disabled: boolean; color: string;
}) {
  const bgColor = color === 'orange' ? 'bg-orange-500' : 'bg-amber-500'
  const borderColor = color === 'orange' ? 'border-orange-500/30' : 'border-amber-500/30'
  const hoverBorder = color === 'orange' ? 'hover:border-orange-500/60' : 'hover:border-amber-500/60'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-lg border ${borderColor} ${!voted ? hoverBorder : ''} bg-continuum-bg relative overflow-hidden transition ${disabled && !voted ? 'opacity-50' : ''}`}
    >
      {/* Progress bar background */}
      {voted && (
        <div
          className={`absolute inset-y-0 left-0 ${bgColor} opacity-10 transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      )}
      <div className="relative px-3 py-2 flex items-center justify-between">
        <span className={`text-xs ${voted && isWinning ? 'text-continuum-text font-medium' : 'text-continuum-muted'}`}>
          {label}
        </span>
        {voted && (
          <span className="text-[10px] text-continuum-muted ml-2">
            {pct}% ({votes})
          </span>
        )}
      </div>
    </button>
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

  const sourceIcon = SOURCE_ICONS[pick.source] || '\u{1F310}'
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
// Creative Writing Card
// ============================================
function CreativeWritingCard({ item }: { item: FeedItem }) {
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: { title?: string; body?: string; format?: string; reason?: string; tags?: string[] } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.body) return <FeedCard item={item} />

  const formatLabel: Record<string, string> = {
    poem: '\u2728 Poem',
    micro_story: '\u{1F4D6} Story',
    thought_experiment: '\u{1F9E0} What if...',
    journal_prompt: '\u{1F4DD} Journal Prompt',
    letter: '\u{1F48C} Letter',
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
            {formatLabel[data.format || ''] || 'Written for you'}
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
// Daily Brief Card
// ============================================
function DailyBriefCard({ item }: { item: FeedItem }) {
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: { title?: string; body?: string; reason?: string; tags?: string[] } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.body) return <FeedCard item={item} />

  const lines = data.body.split('\n').map(l => l.replace(/^[-{'\u2022'}]\s*/, '').trim()).filter(Boolean)

  return (
    <div
      onClick={() => trackInteraction('feed_item_tap', { feedItemId: item.id, type: item.type })}
      className={`rounded-xl border overflow-hidden transition ${
        item.seen ? 'bg-continuum-surface border-continuum-border' : 'bg-continuum-surface border-amber-500/30'
      }`}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-amber-400">{'\u2600'}{'\uFE0F'} {data.title || 'Your Day'}</span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-amber-400/60 text-xs mt-0.5">{'\u203A'}</span>
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
// Curated Find Card
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
          <span className="text-xs font-medium text-teal-400">{'\u{1F50D}'} Emily found this</span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        {data.title && (
          <p className="text-sm font-semibold text-continuum-text mb-1">{data.title}</p>
        )}
        <p className="text-sm text-continuum-text leading-relaxed">{data.body}</p>
      </div>
      {data.reason && (
        <div className="px-4 pb-3 pt-1 border-t border-continuum-border/50">
          <p className="text-xs text-continuum-muted italic">{'\u{1F4A1}'} {data.reason}</p>
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
// Video Script Card
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
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-400">{'\u{1F3AC}'} Script</span>
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

      <div className="px-4 pb-2">
        <p className="text-sm text-continuum-text leading-relaxed italic">
          &ldquo;{data.narrationFull}&rdquo;
        </p>
      </div>

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
          <p className="text-[10px] text-continuum-muted">Tap to see {data.scenes.length}-scene storyboard {'\u2192'}</p>
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

// ============================================
// Echo Connection Card — AI found a match
// ============================================
function EchoConnectionCard({ item }: { item: FeedItem }) {
  const [responding, setResponding] = useState(false)
  const [responded, setResponded] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const timeAgo = getTimeAgo(new Date(item.createdAt))

  let data: { connectionId?: string; message?: string; action?: string } | null = null
  try { data = JSON.parse(item.content) } catch { return <FeedCard item={item} /> }
  if (!data?.message) return <FeedCard item={item} />

  const handleAction = async (actionType: 'accepted' | 'dismissed') => {
    if (!data?.connectionId || responding) return
    setResponding(true)
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: data.connectionId, action: actionType }),
      })
      if (res.ok) {
        setResponded(true)
        setAction(actionType)
        trackInteraction(('echo_connection_' + actionType) as any, { connectionId: data.connectionId })
      }
    } catch { /* silent */ }
    setResponding(false)
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden transition ${
        item.seen ? 'bg-continuum-surface border-continuum-border' : 'bg-continuum-surface border-violet-500/30'
      }`}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-violet-400">Echo Match</span>
          <span className="text-xs text-continuum-muted">{timeAgo}</span>
        </div>
        <p className="text-sm text-continuum-text leading-relaxed">{data.message}</p>
      </div>

      {!responded ? (
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => handleAction('accepted')}
            disabled={responding}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition disabled:opacity-50"
          >
            {responding ? '...' : 'Connect'}
          </button>
          <button
            onClick={() => handleAction('dismissed')}
            disabled={responding}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-continuum-bg text-continuum-muted hover:bg-continuum-border/50 transition disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      ) : (
        <div className="px-4 pb-3">
          <p className="text-xs text-continuum-muted italic">
            {action === 'accepted' ? 'Connection accepted! You\'ll hear more soon.' : 'Got it, maybe next time.'}
          </p>
        </div>
      )}
    </div>
  )
}
