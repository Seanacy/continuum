'use client'

import { useState, useEffect } from 'react'
import { useUser, useChat } from '@/lib/hooks'
import AppShell from '@/components/AppShell'
import ChatView from '@/components/ChatView'
import FeedView from '@/components/FeedView'
import ThreadsView from '@/components/ThreadsView'
import OnboardingFlow from '@/components/OnboardingFlow'

type View = 'chat' | 'feed' | 'threads'

export default function HomePage() {
  const { user, loading } = useUser()
  const [activeView, setActiveView] = useState<View>('chat')
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const { messages } = useChat()

  // Show onboarding if user has zero messages
  useEffect(() => {
    if (user && messages.length === 0) {
      setShowOnboarding(true)
    }
  }, [user, messages.length])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-continuum-bg">
        <span className="text-continuum-muted animate-pulse">Loading...</span>
      </div>
    )
  }

  if (!user) {
    // Middleware handles the redirect — just show nothing while it kicks in
    return (
      <div className="flex items-center justify-center min-h-screen bg-continuum-bg">
        <span className="text-continuum-muted animate-pulse">Redirecting...</span>
      </div>
    )
  }

  if (showOnboarding) {
    return (
      <OnboardingFlow
        aiName={user.aiName || 'Your AI'}
        onComplete={() => setShowOnboarding(false)}
      />
    )
  }

  function handleOpenThread(threadId: string) {
    setActiveThreadId(threadId)
    setActiveView('chat')
  }

  function handleViewChange(view: View) {
    if (view === 'chat') {
      setActiveThreadId(undefined)
    }
    setActiveView(view)
  }

  return (
    <AppShell
      aiName={user.aiName || 'Your AI'}
      activeView={activeView}
      onViewChange={handleViewChange}
    >
      {activeView === 'chat' && <ChatView threadId={activeThreadId} />}
      {activeView === 'feed' && <FeedView />}
      {activeView === 'threads' && <ThreadsView onOpenThread={handleOpenThread} />}
    </AppShell>
  )
}
