// Interaction Tracker
// Lightweight client-side utility that logs user behavior to the interactions table.
// Tracks: tab views, feed item taps, app returns, session time, chat opens.
// All calls are fire-and-forget — never block the UI.

type InteractionType =
  | 'app_open'        // user opened/returned to the app
  | 'tab_switch'      // switched tabs (chat, feed, threads, settings)
  | 'feed_view'       // viewed the feed tab (duration tracked)
  | 'feed_item_tap'   // tapped/engaged with a specific feed item
  | 'chat_message'    // sent a chat message
  | 'thread_open'     // opened a specific thread
  | 'session_end'     // leaving the app (beforeunload)

interface InteractionPayload {
  type: InteractionType
  metadata?: Record<string, unknown>
}

// Batch interactions and flush periodically to avoid spamming the API
let buffer: InteractionPayload[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 5000 // 5 seconds

async function flush() {
  if (buffer.length === 0) return
  const batch = [...buffer]
  buffer = []

  try {
    await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactions: batch }),
    })
  } catch {
    // If flush fails, don't re-queue — interaction logging should never break the app
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL)
}

export function trackInteraction(type: InteractionType, metadata?: Record<string, unknown>) {
  buffer.push({ type, metadata })
  scheduleFlush()
}

// Flush immediately (used on page unload)
export function flushNow() {
  if (buffer.length === 0) return
  const batch = [...buffer]
  buffer = []

  // Use sendBeacon for reliability on page unload
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/interactions',
      new Blob([JSON.stringify({ interactions: batch })], { type: 'application/json' })
    )
  } else {
    fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactions: batch }),
      keepalive: true,
    }).catch(() => {})
  }
}

// ============================================
// Tab time tracking
// Tracks how long the user spends on each tab
// ============================================
let currentTab: string | null = null
let tabStartTime: number | null = null

export function trackTabSwitch(newTab: string) {
  const now = Date.now()

  // Log time spent on previous tab
  if (currentTab && tabStartTime) {
    const durationMs = now - tabStartTime
    if (durationMs > 1000) { // Only log if they stayed more than 1 second
      trackInteraction('tab_switch', {
        tab: currentTab,
        durationMs,
      })
    }
  }

  currentTab = newTab
  tabStartTime = now
}

// ============================================
// Session tracking
// Logs app_open on mount, session_end on unload
// ============================================
let sessionStarted = false

export function startSession() {
  if (sessionStarted) return
  sessionStarted = true

  trackInteraction('app_open', {
    timestamp: new Date().toISOString(),
    referrer: typeof document !== 'undefined' ? document.referrer : undefined,
  })

  // Flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      // Log final tab time
      if (currentTab && tabStartTime) {
        const durationMs = Date.now() - tabStartTime
        if (durationMs > 1000) {
          trackInteraction('tab_switch', { tab: currentTab, durationMs })
        }
      }

      trackInteraction('session_end', {
        sessionDurationMs: Date.now() - (tabStartTime || Date.now()),
      })

      flushNow()
    })

    // Also flush when tab becomes hidden (mobile)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushNow()
      }
    })
  }
}
