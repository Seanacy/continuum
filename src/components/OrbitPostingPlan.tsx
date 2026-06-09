'use client'

import { useState } from 'react'

// ============================================
// ORBIT POSTING PLAN — monthly calendar with per-post images
// ============================================
// Shows each scheduled post on its day. Posts without an image are
// clearly flagged. You can attach an image to any post, or generate
// them with AI (one click does the whole visible month). Tap a
// thumbnail to enlarge. Works on desktop and the PWA.
// ============================================

interface PlanPost {
  id: string
  characterId: string
  characterName: string
  content: string
  scheduledFor?: string
  imageUrl?: string | null
  isGroup?: boolean
  dayLabel?: string
}

interface OrbitPostingPlanProps {
  projectId: string
  posts: PlanPost[]
  onChange?: () => void
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const CHAR_COLORS: Record<string, string> = {
  mb_maya: '#f59e0b',
  mb_jade: '#10b981',
  mb_lily: '#ec4899',
  mb_rae: '#8b5cf6',
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function OrbitPostingPlan({ projectId, posts, onChange }: OrbitPostingPlanProps) {
  // Default the calendar to the month of the first scheduled post, else today.
  const firstDate = posts.find((p) => p.scheduledFor)?.scheduledFor
  const [currentDate, setCurrentDate] = useState<Date>(firstDate ? new Date(firstDate) : new Date())
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const withImages = posts.filter((p) => p.imageUrl).length

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  async function handleUpload(postId: string, file: File) {
    setError('')
    setUploadingId(postId)
    try {
      const fd = new FormData()
      fd.append('projectId', projectId)
      fd.append('postId', postId)
      fd.append('file', file)
      const res = await fetch('/api/orbit/post-image', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Upload failed')
      } else if (onChange) {
        onChange()
      }
    } catch {
      setError('Upload failed')
    }
    setUploadingId(null)
  }

  // Generate AI images for every post in the visible month that has no image yet.
  async function generateMissing() {
    setError('')
    const targets = posts.filter((p) => {
      if (p.imageUrl || !p.scheduledFor) return false
      const d = new Date(p.scheduledFor)
      return d.getFullYear() === year && d.getMonth() === month
    })
    if (targets.length === 0) {
      setError('Every post this month already has an image.')
      return
    }
    setGenerating(true)
    setGenProgress({ done: 0, total: targets.length })
    let failures = 0
    for (let i = 0; i < targets.length; i++) {
      try {
        const res = await fetch('/api/orbit/generate-post-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, postId: targets[i].id }),
        })
        if (!res.ok) failures++
        else if (onChange) onChange()
      } catch {
        failures++
      }
      setGenProgress({ done: i + 1, total: targets.length })
    }
    setGenerating(false)
    if (failures > 0) setError(`${failures} image(s) couldn't be generated. You can retry or upload those yourself.`)
  }

  // Build the month grid (Monday-first).
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7
  const days: Array<{ date: Date; isCurrentMonth: boolean }> = []
  for (let i = startOffset - 1; i >= 0; i--) days.push({ date: new Date(year, month, -i), isCurrentMonth: false })
  for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true })
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1), isCurrentMonth: false })

  const byDay: Record<string, PlanPost[]> = {}
  posts.forEach((p) => {
    if (!p.scheduledFor) return
    const k = p.scheduledFor.split('T')[0]
    ;(byDay[k] = byDay[k] || []).push(p)
  })

  const navigate = (dir: number) => setCurrentDate(new Date(year, month + dir, 1))
  const today = new Date()

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7', margin: 0 }}>Posting Plan</h2>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
            {withImages} of {posts.length} posts have an image
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={generateMissing}
            disabled={generating}
            style={{
              padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: generating ? 'default' : 'pointer',
              backgroundColor: generating ? '#3f3f46' : '#8b5cf6', color: '#fff', fontSize: '13px', fontWeight: 600,
            }}
          >
            {generating ? `Generating ${genProgress.done}/${genProgress.total}…` : '✨ Generate missing images'}
          </button>
          <button onClick={() => navigate(-1)} style={navBtn} disabled={generating}>{'<'}</button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#e4e4e7', minWidth: '120px', textAlign: 'center' }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={() => navigate(1)} style={navBtn} disabled={generating}>{'>'}</button>
        </div>
      </div>

      {generating && (
        <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', fontSize: '12px' }}>
          Making your photos… this takes about 20–30 seconds each, so a full week is a few minutes. You can leave this open.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#71717a' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {days.map((day, i) => {
          const k = dateKey(day.date)
          const dayPosts = byDay[k] || []
          const isToday = dateKey(day.date) === dateKey(today)
          return (
            <div key={i} style={{
              minHeight: '110px',
              padding: '4px',
              backgroundColor: day.isCurrentMonth ? '#0f0f17' : '#0a0a0f',
              border: isToday ? '1px solid rgba(139,92,246,0.5)' : '1px solid #1e1e2e',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: isToday ? 700 : 400, color: isToday ? '#8b5cf6' : day.isCurrentMonth ? '#a1a1aa' : '#3f3f46', marginBottom: '3px' }}>
                {day.date.getDate()}
              </div>
              {dayPosts.map((p) => {
                const color = CHAR_COLORS[p.characterId] || '#8b5cf6'
                return (
                  <div key={p.id} style={{ marginBottom: '4px', borderRadius: '5px', overflow: 'hidden', backgroundColor: color + '14', border: `1px solid ${color}33` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.characterName}
                      </span>
                    </div>
                    {/* Caption preview */}
                    <div style={{ fontSize: '9px', color: '#71717a', padding: '0 5px 3px', lineHeight: 1.3, maxHeight: '24px', overflow: 'hidden' }}>
                      {p.content.slice(0, 50)}
                    </div>
                    {/* Image or needs-image */}
                    {p.imageUrl ? (
                      <button
                        onClick={() => setLightbox(p.imageUrl as string)}
                        style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
                      >
                        <img src={p.imageUrl} alt="" style={{ width: '100%', height: '54px', objectFit: 'cover', display: 'block' }} />
                      </button>
                    ) : (
                      <label style={{
                        display: 'block', margin: '0 5px 5px', padding: '4px', textAlign: 'center',
                        fontSize: '9px', fontWeight: 600, color: '#fca5a5',
                        backgroundColor: 'rgba(239,68,68,0.08)', border: '1px dashed rgba(239,68,68,0.4)',
                        borderRadius: '4px', cursor: 'pointer',
                      }}>
                        {uploadingId === p.id ? 'Uploading…' : '+ Needs image'}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(p.id, f) }} />
                      </label>
                    )}
                    {/* Replace link when an image already exists */}
                    {p.imageUrl && (
                      <label style={{ display: 'block', textAlign: 'center', fontSize: '8px', color: '#71717a', padding: '2px', cursor: 'pointer' }}>
                        {uploadingId === p.id ? 'Uploading…' : 'Change'}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(p.id, f) }} />
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px', cursor: 'zoom-out',
        }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '6px',
  backgroundColor: '#1e1e2e',
  border: '1px solid #2e2e3e',
  color: '#e4e4e7',
  fontSize: '12px',
  cursor: 'pointer',
}
