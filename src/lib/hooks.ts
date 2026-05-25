'use client'

import { useState, useEffect, useCallback } from 'react'
import { trackInteraction } from './interaction-tracker'

// ============================================
// useUser â get current authenticated user
// ============================================
export function useUser() {
  const [user, setUser] = useState<{
    id: string
    email: string
    name: string | null
    aiName: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user || null))
      .finally(() => setLoading(false))
  }, [])

  return { user, loading }
}

// ============================================
// useCharacters â fetch all user's active characters
// ============================================
export interface CharacterSummary {
  id: string
  name: string
  imageUrls: string[]
  nicheType: string | null
}

export function useCharacters() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/characters/mine')
      if (res.ok) {
        const data = await res.json()
        setCharacters(
          (data.characters || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            imageUrls: c.imageUrls || [],
            nicheType: c.nicheType || null,
          }))
        )
      }
    } catch {
      // Silently fail â characters are optional
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { characters, loading, reload: load }
}

// ============================================
// useChat â manage chat state
// ============================================
export function useChat(threadId?: string, characterId?: string) {
  const [messages, setMessages] = useState<
    Array<{
      id: string
      role: string
      content: string
      createdAt: string
      characterId?: string | null
      characterName?: string | null
      searchQuery?: string
      imageUrls?: string[]
      reminderSet?: { content: string; dueAt: string }
      generatedContent?: {
        contentType: string
        platform?: string
        topic: string
        content: string
        hashtags?: string[]
        priceCents: number
      }
      generatedImage?: { url: string; prompt: string; width?: number; height?: number; priceCents: number }
      openCharacterBuilder?: { suggestion?: string }
      contentPack?: { pieces: any[]; weekTheme: string; totalPriceCents: number }
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [searching, setSearching] = useState(false)
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null)
  const [dailyLimitReached, setDailyLimitReached] = useState(false)

  const loadMessages = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (threadId) params.set('threadId', threadId)
    const res = await fetch(`/api/chat?${params}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data.messages)
    }
    setLoading(false)
  }, [threadId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const sendMessage = async (content: string, image?: string, imageType?: string, partnerMode?: boolean) => {
    setSending(true)
    setSearching(false)
    const displayContent = image ? `[Sent an image] ${content}` : content
    const tempMsg = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: displayContent,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMsg])

    // Show "searching" state after a short delay â any web search takes 4+ seconds,
    // so if we're still waiting after 1.5s, Emily is almost certainly searching
    const searchTimer = setTimeout(() => setSearching(true), 1500)

    trackInteraction('chat_message', { threadId, hasImage: !!image })

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          threadId,
          characterId,
          ...(image ? { image, imageType } : {}),
          ...(partnerMode ? { partnerMode: true } : {}),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          localTime: new Date().toISOString(),
        }),
      })

      clearTimeout(searchTimer)

      if (res.ok) {
        const data = await res.json()
        const aiMsg = {
          ...data.message,
          searchQuery: data.searchPerformed ? data.searchQuery : undefined,
          imageUrls: data.imageUrls || undefined,
          reminderSet: data.reminderSet || undefined,
          generatedContent: data.generatedContent || undefined,
          generatedImage: data.generatedImage || undefined,
          openCharacterBuilder: data.openCharacterBuilder || undefined,
          contentPack: data.contentPack || undefined,
        }
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempMsg.id),
          { ...tempMsg, id: 'user-' + Date.now() },
          aiMsg,
        ])
        if (data.dailyRemaining !== undefined) setDailyRemaining(data.dailyRemaining)
      } else if (res.status === 429) {
        const errData = await res.json()
        setDailyRemaining(0)
        setDailyLimitReached(true)
        // Remove the optimistic user message
        setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id))
      }
    } catch (error) {
      clearTimeout(searchTimer)
      console.error('Send failed:', error)
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id))
    } finally {
      setSending(false)
      setSearching(false)
    }
  }

  return { messages, loading, sending, searching, dailyRemaining, dailyLimitReached, sendMessage, reload: loadMessages }
}

// ============================================
// useFeed â manage feed state
// ============================================
export function useFeed() {
  const [items, setItems] = useState<
    Array<{
      id: string
      type: string
      content: string
      referenceId: string | null
      seen: boolean
      createdAt: string
    }>
  >([])
  const [unseenCount, setUnseenCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadFeed = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/feed')
    if (res.ok) {
      const data = await res.json()
      setItems(data.feedItems)
      setUnseenCount(data.unseenCount)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  const markSeen = async (ids: string[]) => {
    await fetch('/api/feed', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setItems((prev) =>
      prev.map((item) => (ids.includes(item.id) ? { ...item, seen: true } : item))
    )
    setUnseenCount((prev) => Math.max(0, prev - ids.length))
  }

  return { items, unseenCount, loading, markSeen, reload: loadFeed }
}

// ============================================
// useThreads â manage threads
// ============================================
export function useThreads() {
  const [threads, setThreads] = useState<
    Array<{
      id: string
      title: string
      status: string
      summary: string | null
      updatedAt: string
      _count: { messages: number }
    }>
  >([])
  const [loading, setLoading] = useState(true)

  const loadThreads = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/threads')
    if (res.ok) {
      const data = await res.json()
      setThreads(data.threads)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  const updateStatus = async (id: string, action: string) => {
    await fetch(`/api/threads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    loadThreads()
  }

  return { threads, loading, updateStatus, reload: loadThreads }
}

// ============================================
// useNotifications
// ============================================
export function useNotifications() {
  const [notifications, setNotifications] = useState<
    Array<{
      id: string
      content: string
      type: string
      read: boolean
      createdAt: string
    }>
  >([])
  const [unreadCount, setUnreadCount] = useState(0)

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications?unread=true')
    if (res.ok) {
      const data = await res.json()
      setNotifications(data.notifications)
      setUnreadCount(data.notifications.length)
    }
  }, [])

  useEffect(() => {
    load()
    // Poll every 60 seconds
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  const markRead = async (ids: string[]) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setNotifications((prev) =>
      prev.filter((n) => !ids.includes(n.id))
    )
    setUnreadCount((prev) => Math.max(0, prev - ids.length))
  }

  return { notifications, unreadCount, markRead, reload: load }
}
