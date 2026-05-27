'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================
// ORBIT CALENDAR â Visual Content Scheduling
// ============================================
// Month/Week/Day views with character color coding,
// optimal time slot indicators, conflict warnings,
// and AI-powered scheduling suggestions.
// ============================================

interface CalendarEvent {
  id: string
  postId?: string
  characterId: string
  characterName: string
  platform: string
  contentType: string
  title: string
  scheduledAt: string
  duration: number
  status: string
  color: string
  recurrence?: any
  metadata?: any
}

interface WeeklyOverview {
  weekStart: string
  weekEnd: string
  totalScheduled: number
  byCharacter: Array<{ characterId: string; characterName: string; count: number; platforms: string[] }>
  byPlatform: Array<{ platform: string; count: number }>
  byDay: Array<{ date: string; dayName: string; count: number; events: CalendarEvent[] }>
  gaps: Array<{ date: string; suggestion: string }>
}

interface TimeSlot {
  dayOfWeek: number
  hour: number
  minute: number
  score: number
  platform: string
  reason: string
}

interface CalendarSuggestion {
  characterId: string
  characterName: string
  platform: string
  contentType: string
  suggestedTime: string
  reason: string
  score: number
}

interface OrbitCalendarProps {
  projectId: string
  characters?: Array<{ id: string; name: string; roleType?: string }>
}

type ViewMode = 'month' | 'week' | 'day'

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'IG',
  twitter: 'X',
  tiktok: 'TT',
  youtube: 'YT',
  linkedin: 'LI',
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ============================================
// HELPER FUNCTIONS
// ============================================

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ============================================
// SUB-COMPONENTS
// ============================================

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span style={{
      fontSize: '9px',
      fontWeight: 700,
      padding: '1px 4px',
      borderRadius: '3px',
      backgroundColor: 'rgba(139, 92, 246, 0.2)',
      color: '#a78bfa',
      letterSpacing: '0.5px',
    }}>
      {PLATFORM_ICONS[platform] || platform.slice(0, 2).toUpperCase()}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    scheduled: '#8b5cf6',
    published: '#10b981',
    draft: '#71717a',
    failed: '#ef4444',
    cancelled: '#71717a',
  }
  return (
    <span style={{
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: colors[status] || '#71717a',
      display: 'inline-block',
      flexShrink: 0,
    }} />
  )
}

function EventCard({ event, compact, onClick }: { event: CalendarEvent; compact?: boolean; onClick?: () => void }) {
  if (compact) {
    return (
      <div
        onClick={onClick}
        style={{
          fontSize: '10px',
          padding: '2px 4px',
          borderRadius: '3px',
          backgroundColor: event.color + '22',
          borderLeft: `2px solid ${event.color}`,
          cursor: 'pointer',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          color: '#e4e4e7',
          marginBottom: '1px',
        }}
      >
        <PlatformBadge platform={event.platform} />
        <span style={{ marginLeft: '3px' }}>{event.characterName.split(' ')[0]}</span>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 10px',
        borderRadius: '6px',
        backgroundColor: event.color + '15',
        borderLeft: `3px solid ${event.color}`,
        cursor: 'pointer',
        marginBottom: '4px',
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = event.color + '25' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = event.color + '15' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
        <StatusDot status={event.status} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#e4e4e7' }}>{event.characterName}</span>
        <PlatformBadge platform={event.platform} />
        <span style={{ fontSize: '10px', color: '#71717a', marginLeft: 'auto' }}>{formatTime(event.scheduledAt)}</span>
      </div>
      <div style={{ fontSize: '11px', color: '#a1a1aa', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {event.title}
      </div>
    </div>
  )
}

function OptimalSlotIndicator({ slot }: { slot: TimeSlot }) {
  return (
    <div style={{
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      border: '1px dashed rgba(16, 185, 129, 0.3)',
      fontSize: '10px',
      color: '#10b981',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      <span style={{ fontSize: '12px' }}>*</span>
      <span>{slot.score}% â {slot.reason}</span>
    </div>
  )
}

function SuggestionCard({ suggestion, onApply }: { suggestion: CalendarSuggestion; onApply: () => void }) {
  return (
    <div style={{
      padding: '10px',
      borderRadius: '6px',
      backgroundColor: 'rgba(139, 92, 246, 0.08)',
      border: '1px solid rgba(139, 92, 246, 0.2)',
      marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e4e4e7' }}>{suggestion.characterName}</span>
        <PlatformBadge platform={suggestion.platform} />
        <span style={{
          fontSize: '10px',
          padding: '1px 6px',
          borderRadius: '10px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          marginLeft: 'auto',
        }}>
          Score: {suggestion.score}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '6px' }}>
        {suggestion.reason}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: '#71717a' }}>
          {formatTime(suggestion.suggestedTime)} â {suggestion.contentType}
        </span>
        <button
          onClick={onApply}
          style={{
            fontSize: '10px',
            padding: '3px 10px',
            borderRadius: '4px',
            backgroundColor: '#8b5cf6',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Schedule
        </button>
      </div>
    </div>
  )
}

// ============================================
// SCHEDULE MODAL
// ============================================

function ScheduleModal({
  characters,
  initialDate,
  onClose,
  onSchedule
}: {
  characters: Array<{ id: string; name: string }>
  initialDate?: string
  onClose: () => void
  onSchedule: (data: any) => void
}) {
  const [characterId, setCharacterId] = useState(characters[0]?.id || '')
  const [platform, setPlatform] = useState('instagram')
  const [contentType, setContentType] = useState('post')
  const [title, setTitle] = useState('')
  const [scheduledDate, setScheduledDate] = useState(initialDate || new Date().toISOString().split('T')[0])
  const [scheduledTime, setScheduledTime] = useState('10:00')

  const handleSubmit = () => {
    if (!characterId || !title) return
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
    onSchedule({ characterId, platform, contentType, title, scheduledAt })
  }

  const selectStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    backgroundColor: '#1e1e2e',
    border: '1px solid #2e2e3e',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#14141f',
          borderRadius: '12px',
          border: '1px solid #1e1e2e',
          padding: '20px',
          width: '380px',
          maxWidth: '90vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7', marginBottom: '16px', marginTop: 0 }}>
          Schedule Post
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Character</label>
            <select value={characterId} onChange={(e) => setCharacterId(e.target.value)} style={selectStyle as any}>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={selectStyle as any}>
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter / X</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Type</label>
              <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={selectStyle as any}>
                <option value="post">Post</option>
                <option value="reel">Reel</option>
                <option value="story">Story</option>
                <option value="thread">Thread</option>
                <option value="video">Video</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Title / Description</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this post about?"
              style={{
                ...selectStyle,
                fontFamily: 'inherit',
              } as any}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                style={selectStyle as any}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={selectStyle as any}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid #2e2e3e',
              color: '#71717a',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!characterId || !title}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: !characterId || !title ? '#3f3f46' : '#8b5cf6',
              border: 'none',
              color: !characterId || !title ? '#71717a' : '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: !characterId || !title ? 'default' : 'pointer',
            }}
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// MAIN CALENDAR COMPONENT
// ============================================

export default function OrbitCalendar({ projectId, characters = [] }: OrbitCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [weekOverview, setWeekOverview] = useState<WeeklyOverview | null>(null)
  const [optimalSlots, setOptimalSlots] = useState<TimeSlot[]>([])
  const [suggestions, setSuggestions] = useState<CalendarSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>()
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [seedingDemo, setSeedingDemo] = useState(false)

  // ---- Data fetching ----
  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      let startDate: Date
      let endDate: Date

      if (viewMode === 'month') {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      } else if (viewMode === 'week') {
        startDate = getMonday(currentDate)
        endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + 7)
      } else {
        startDate = new Date(currentDate)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(currentDate)
        endDate.setHours(23, 59, 59, 999)
      }

      const res = await fetch(
        `/api/orbit/${projectId}/calendar?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )
      const data = await res.json()
      setEvents(data.events || [])

      // Also fetch week overview
      if (viewMode === 'week') {
        const weekRes = await fetch(
          `/api/orbit/${projectId}/calendar?view=week&startDate=${startDate.toISOString()}`
        )
        const weekData = await weekRes.json()
        setWeekOverview(weekData)
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err)
    }
    setLoading(false)
  }, [projectId, currentDate, viewMode])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // ---- Navigation ----
  const navigate = (direction: number) => {
    const d = new Date(currentDate)
    if (viewMode === 'month') d.setMonth(d.getMonth() + direction)
    else if (viewMode === 'week') d.setDate(d.getDate() + 7 * direction)
    else d.setDate(d.getDate() + direction)
    setCurrentDate(d)
  }

  const goToToday = () => setCurrentDate(new Date())

  // ---- Actions ----
  const handleSchedule = async (data: any) => {
    try {
      await fetch(`/api/orbit/${projectId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'schedule', ...data }),
      })
      setShowScheduleModal(false)
      fetchEvents()
    } catch (err) {
      console.error('Schedule failed:', err)
    }
  }

  const handleCancel = async (postId: string) => {
    try {
      await fetch(`/api/orbit/${projectId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', postId }),
      })
      setSelectedEvent(null)
      fetchEvents()
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  const handleSeedDemo = async () => {
    setSeedingDemo(true)
    try {
      await fetch(`/api/orbit/${projectId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_demo' }),
      })
      fetchEvents()
    } catch (err) {
      console.error('Seed failed:', err)
    }
    setSeedingDemo(false)
  }

  const handleAISuggestions = async () => {
    setAiLoading(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggestions', weekStartDate: currentDate.toISOString() }),
      })
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch (err) {
      console.error('AI suggestions failed:', err)
    }
    setAiLoading(false)
  }

  const handleApplySuggestion = async (suggestion: CalendarSuggestion) => {
    await handleSchedule({
      characterId: suggestion.characterId,
      platform: suggestion.platform,
      contentType: suggestion.contentType,
      title: `AI Suggested: ${suggestion.reason.slice(0, 60)}`,
      scheduledAt: suggestion.suggestedTime,
    })
    setSuggestions(prev => prev.filter(s => s !== suggestion))
  }

  const handleFetchOptimalSlots = async (platform: string) => {
    try {
      const res = await fetch(
        `/api/orbit/${projectId}/calendar?view=optimal&platform=${platform}`
      )
      const data = await res.json()
      setOptimalSlots(data.slots || [])
    } catch (err) {
      console.error('Optimal slots failed:', err)
    }
  }

  // ---- Date label ----
  const getDateLabel = (): string => {
    if (viewMode === 'month') {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    } else if (viewMode === 'week') {
      const monday = getMonday(currentDate)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      const mLabel = `${MONTH_NAMES[monday.getMonth()].slice(0, 3)} ${monday.getDate()}`
      const sLabel = `${MONTH_NAMES[sunday.getMonth()].slice(0, 3)} ${sunday.getDate()}`
      return `${mLabel} - ${sLabel}, ${sunday.getFullYear()}`
    } else {
      return `${FULL_DAY_NAMES[(currentDate.getDay() + 6) % 7]}, ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}`
    }
  }

  // ---- Render: Month View ----
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startOffset = (firstDay.getDay() + 6) % 7 // Monday = 0

    const days: Array<{ date: Date; isCurrentMonth: boolean }> = []

    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      days.push({ date: d, isCurrentMonth: false })
    }
    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }
    // Next month padding
    while (days.length % 7 !== 0) {
      const d = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1)
      days.push({ date: d, isCurrentMonth: false })
    }

    const today = new Date()

    return (
      <div>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '1px' }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ padding: '6px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#71717a' }}>
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
          {days.map((day, i) => {
            const dk = dateKey(day.date)
            const dayEvents = events.filter(e => e.scheduledAt.startsWith(dk))
            const isToday = isSameDay(day.date, today)

            return (
              <div
                key={i}
                onClick={() => {
                  setCurrentDate(day.date)
                  setViewMode('day')
                }}
                style={{
                  minHeight: '80px',
                  padding: '4px',
                  backgroundColor: isToday ? 'rgba(139, 92, 246, 0.06)' : day.isCurrentMonth ? '#0f0f17' : '#0a0a0f',
                  border: isToday ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid #1e1e2e',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => { if (!isToday) (e.currentTarget as HTMLElement).style.backgroundColor = '#14141f' }}
                onMouseLeave={(e) => { if (!isToday) (e.currentTarget as HTMLElement).style.backgroundColor = day.isCurrentMonth ? '#0f0f17' : '#0a0a0f' }}
              >
                <div style={{
                  fontSize: '11px',
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#8b5cf6' : day.isCurrentMonth ? '#e4e4e7' : '#3f3f46',
                  marginBottom: '2px',
                }}>
                  {day.date.getDate()}
                </div>
                {dayEvents.slice(0, 3).map(evt => (
                  <EventCard key={evt.id} event={evt} compact onClick={() => setSelectedEvent(evt)} />
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: '9px', color: '#71717a', textAlign: 'center' }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- Render: Week View ----
  const renderWeekView = () => {
    const monday = getMonday(currentDate)
    const today = new Date()
    const hours = Array.from({ length: 16 }, (_, i) => i + 6) // 6 AM to 9 PM

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(d.getDate() + i)
      return d
    })

    return (
      <div style={{ overflowX: 'auto' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)', gap: '1px', marginBottom: '1px' }}>
          <div style={{ padding: '6px' }} />
          {weekDays.map((d, i) => {
            const isToday = isSameDay(d, today)
            return (
              <div
                key={i}
                onClick={() => { setCurrentDate(d); setViewMode('day') }}
                style={{
                  padding: '8px 4px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: isToday ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                  borderRadius: '6px',
                }}
              >
                <div style={{ fontSize: '11px', color: '#71717a' }}>{DAY_NAMES[i]}</div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: isToday ? '#8b5cf6' : '#e4e4e7',
                }}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)', gap: '0' }}>
          {hours.map(hour => (
            <div key={hour} style={{ display: 'contents' }}>
              {/* Time label */}
              <div style={{
                padding: '4px',
                fontSize: '10px',
                color: '#71717a',
                textAlign: 'right',
                borderTop: '1px solid #1a1a28',
                height: '48px',
              }}>
                {hour % 12 || 12}{hour >= 12 ? 'p' : 'a'}
              </div>
              {/* Day columns */}
              {weekDays.map((d, di) => {
                const dk = dateKey(d)
                const cellEvents = events.filter(e => {
                  const eDate = new Date(e.scheduledAt)
                  return e.scheduledAt.startsWith(dk) && eDate.getHours() === hour
                })

                return (
                  <div
                    key={di}
                    onClick={() => {
                      const clickDate = new Date(d)
                      clickDate.setHours(hour, 0, 0, 0)
                      setModalInitialDate(dateKey(clickDate))
                      setShowScheduleModal(true)
                    }}
                    style={{
                      borderTop: '1px solid #1a1a28',
                      borderLeft: '1px solid #1a1a28',
                      height: '48px',
                      padding: '2px',
                      cursor: 'pointer',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(139, 92, 246, 0.04)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  >
                    {cellEvents.map(evt => (
                      <EventCard key={evt.id} event={evt} compact onClick={() => setSelectedEvent(evt)} />
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- Render: Day View ----
  const renderDayView = () => {
    const dk = dateKey(currentDate)
    const dayEvents = events.filter(e => e.scheduledAt.startsWith(dk))
    const hours = Array.from({ length: 18 }, (_, i) => i + 5) // 5 AM to 10 PM

    return (
      <div>
        {hours.map(hour => {
          const hourEvents = dayEvents.filter(e => new Date(e.scheduledAt).getHours() === hour)
          return (
            <div key={hour} style={{ display: 'flex', borderTop: '1px solid #1a1a28', minHeight: '52px' }}>
              <div style={{
                width: '60px',
                flexShrink: 0,
                padding: '4px 8px',
                fontSize: '11px',
                color: '#71717a',
                textAlign: 'right',
              }}>
                {hour % 12 || 12}:00 {hour >= 12 ? 'PM' : 'AM'}
              </div>
              <div
                style={{ flex: 1, padding: '2px 4px', cursor: 'pointer' }}
                onClick={() => {
                  setModalInitialDate(dk)
                  setShowScheduleModal(true)
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(139, 92, 246, 0.04)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                {hourEvents.map(evt => (
                  <EventCard key={evt.id} event={evt} onClick={() => setSelectedEvent(evt)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ---- Render: Event Detail Panel ----
  const renderEventDetail = () => {
    if (!selectedEvent) return null
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
        onClick={() => setSelectedEvent(null)}
      >
        <div
          style={{
            backgroundColor: '#14141f',
            borderRadius: '12px',
            border: `1px solid ${selectedEvent.color}33`,
            padding: '20px',
            width: '360px',
            maxWidth: '90vw',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: selectedEvent.color,
            }} />
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#e4e4e7' }}>{selectedEvent.characterName}</span>
            <PlatformBadge platform={selectedEvent.platform} />
          </div>

          <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '12px' }}>{selectedEvent.title}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#71717a' }}>Scheduled</span>
              <span style={{ color: '#e4e4e7' }}>{new Date(selectedEvent.scheduledAt).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#71717a' }}>Type</span>
              <span style={{ color: '#e4e4e7' }}>{selectedEvent.contentType}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#71717a' }}>Status</span>
              <span style={{ color: selectedEvent.status === 'scheduled' ? '#8b5cf6' : selectedEvent.status === 'published' ? '#10b981' : '#71717a' }}>
                {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#71717a' }}>Duration</span>
              <span style={{ color: '#e4e4e7' }}>{selectedEvent.duration} min</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {selectedEvent.status === 'scheduled' && (
              <button
                onClick={() => selectedEvent.postId && handleCancel(selectedEvent.postId)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => setSelectedEvent(null)}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: '#1e1e2e',
                border: 'none',
                color: '#e4e4e7',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Render: Weekly Summary Sidebar ----
  const renderWeeklySummary = () => {
    if (viewMode !== 'week' || !weekOverview) return null

    return (
      <div style={{
        padding: '12px',
        backgroundColor: '#0f0f17',
        borderRadius: '8px',
        border: '1px solid #1e1e2e',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', padding: '0 12px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#8b5cf6' }}>{weekOverview.totalScheduled}</div>
            <div style={{ fontSize: '10px', color: '#71717a' }}>This Week</div>
          </div>

          {weekOverview.byCharacter.slice(0, 4).map(c => (
            <div key={c.characterId} style={{ textAlign: 'center', padding: '0 8px' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7' }}>{c.count}</div>
              <div style={{ fontSize: '10px', color: '#71717a' }}>{c.characterName.split(' ')[0]}</div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
            {weekOverview.byDay.map((d, i) => (
              <div
                key={i}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '4px',
                  backgroundColor: d.count === 0
                    ? 'rgba(239, 68, 68, 0.1)'
                    : d.count <= 2
                    ? 'rgba(139, 92, 246, 0.15)'
                    : 'rgba(139, 92, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: d.count === 0 ? '#ef4444' : '#e4e4e7',
                }}
                title={`${d.dayName}: ${d.count} posts`}
              >
                {d.count}
              </div>
            ))}
          </div>
        </div>

        {weekOverview.gaps.length > 0 && (
          <div style={{
            marginTop: '8px',
            padding: '6px 10px',
            borderRadius: '4px',
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            fontSize: '11px',
            color: '#fca5a5',
          }}>
            Gap{weekOverview.gaps.length > 1 ? 's' : ''}: {weekOverview.gaps.map(g => {
              const d = new Date(g.date)
              return FULL_DAY_NAMES[(d.getDay() + 6) % 7]
            }).join(', ')} â no content scheduled
          </div>
        )}
      </div>
    )
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  const btnStyle = (active: boolean) => ({
    padding: '5px 12px',
    borderRadius: '6px',
    backgroundColor: active ? '#8b5cf6' : 'transparent',
    border: active ? 'none' : '1px solid #2e2e3e',
    color: active ? '#fff' : '#71717a',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer' as const,
  })

  const actionBtnStyle = {
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: '#1e1e2e',
    border: '1px solid #2e2e3e',
    color: '#e4e4e7',
    fontSize: '11px',
    cursor: 'pointer' as const,
    transition: 'background-color 0.15s',
  }

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e4e4e7', margin: 0 }}>
          Content Calendar
        </h2>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={handleSeedDemo} disabled={seedingDemo} style={actionBtnStyle}>
            {seedingDemo ? 'Seeding...' : 'Seed Demo'}
          </button>
          <button onClick={handleAISuggestions} disabled={aiLoading} style={actionBtnStyle}>
            {aiLoading ? 'Thinking...' : 'AI Suggest'}
          </button>
          <button
            onClick={() => { setModalInitialDate(undefined); setShowScheduleModal(true) }}
            style={{
              ...actionBtnStyle,
              backgroundColor: '#8b5cf6',
              border: 'none',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            + Schedule
          </button>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(139, 92, 246, 0.15)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa', marginBottom: '8px' }}>
            AI Scheduling Suggestions
          </div>
          {suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} onApply={() => handleApplySuggestion(s)} />
          ))}
        </div>
      )}

      {/* Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => navigate(-1)} style={{ ...actionBtnStyle, padding: '5px 10px' }}>
            {'<'}
          </button>
          <button onClick={goToToday} style={{ ...actionBtnStyle, padding: '5px 10px' }}>
            Today
          </button>
          <button onClick={() => navigate(1)} style={{ ...actionBtnStyle, padding: '5px 10px' }}>
            {'>'}
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#e4e4e7', marginLeft: '8px' }}>
            {getDateLabel()}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={btnStyle(viewMode === v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Summary */}
      {renderWeeklySummary()}

      {/* Calendar Body */}
      <div style={{
        backgroundColor: '#0a0a0f',
        borderRadius: '8px',
        border: '1px solid #1e1e2e',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {loading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10, 10, 15, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            fontSize: '13px',
            color: '#71717a',
          }}>
            Loading calendar...
          </div>
        )}
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'day' && renderDayView()}
      </div>

      {/* Optimal Time Slots */}
      {optimalSlots.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', marginBottom: '6px' }}>
            Optimal Posting Times
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {optimalSlots.map((slot, i) => (
              <OptimalSlotIndicator key={i} slot={slot} />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showScheduleModal && (
        <ScheduleModal
          characters={characters}
          initialDate={modalInitialDate}
          onClose={() => setShowScheduleModal(false)}
          onSchedule={handleSchedule}
        />
      )}
      {renderEventDetail()}
    </div>
  )
}
