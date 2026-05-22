'use client'

import { useState, useEffect } from 'react'
import { useUser, useChat, useCharacters } from '@/lib/hooks'
import AppShell from '@/components/AppShell'
import ChatView from '@/components/ChatView'
import FeedView from '@/components/FeedView'
import ThreadsView from '@/components/ThreadsView'
import SettingsView from '@/components/SettingsView'
import CharacterBuilder from '@/components/CharacterBuilder'
import OnboardingFlow from '@/components/OnboardingFlow'
import { startSession, trackTabSwitch, trackInteraction } from '@/lib/interaction-tracker'

type View = 'chat' | 'feed' | 'threads' | 'create' | 'settings'

export default function HomePage() {
  const { user, loading } = useUser()
  const [activeView, setActiveView] = useState<View>('chat')
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [partnerMode, setPartnerMode] = useState(false)
  const { messages } = useChat()
  const { characters, reload: reloadCharacters } = useCharacters()
  const [activeCharacterId, setActiveCharacterId] = useState<string | undefined>(undefined)

  // Auto-select active character (prefer isActive, fallback to first)
  useEffect(() => {
    if (characters.length > 0 && !activeCharacterId) {
      const active = characters.find((c: any) => c.isActive)
      setActiveCharacterId(active ? active.id : characters[0].id)
    }
  }, [characters, activeCharacterId])

  // Compute the active character's name for the header
  const activeCharacter = characters.find((c: any) => c.id === activeCharacterId)
  const activeCharacterName = activeCharacter?.name || user?.aiName || 'Your AI'

  // Start interaction tracking session
  useEffect(() => {
    if (user) {
      startSession()
      trackTabSwitch('chat') // default tab
    }
  }, [user])

  // Show onboarding if user has zero messages
  useEffect(() => {
    if (user && messages.length === 0) {
      setShowOnboarding(true)
    }
  }, [user, messages.length])

  // If loading finished and no user, clear session and redirect to login
  useEffect(() => {
    if (!loading && !user) {
      fetch('/api/auth/logout', { method: 'POST' })
        .finally(() => {
          window.location.href = '/login'
        })
    }
  }, [loading, user])

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-continuum-bg">
        <span className="text-continuum-muted animate-pulse">Loading...</span>
      </div>
    )
  }

  if (showOnboarding) {
    return (
      <OnboardingFlow
        aiName={activeCharacterName}
        onComplete={() => setShowOnboarding(false)}
      />
    )
  }

  function handleOpenThread(threadId: string) {
    setActiveThreadId(threadId)
    setActiveView('chat')
    trackInteraction('thread_open', { threadId })
    trackTabSwitch('chat')
  }

  function handleViewChange(view: View) {
    if (view === 'chat') {
      setActiveThreadId(undefined)
    }
    trackTabSwitch(view)
    setActiveView(view)
  }

  return (
    <AppShell
      aiName={activeCharacterName}
      activeView={activeView}
      onViewChange={handleViewChange}
      partnerMode={partnerMode}
      onPartnerModeToggle={() => setPartnerMode(!partnerMode)}
    >
      {activeView === 'chat' && (
        <ChatView
          threadId={activeThreadId}
          partnerMode={partnerMode}
          characterId={activeCharacterId}
          characters={characters}
          onCharacterChange={setActiveCharacterId}
          onGoToCreate={() => handleViewChange('create')}
        />
      )}
      {activeView === 'feed' && <FeedView />}
      {activeView === 'threads' && <ThreadsView onOpenThread={handleOpenThread} />}
      {activeView === 'create' && <CharacterBuilder onGoToChat={() => handleViewChange('chat')} activeCharacterId={activeCharacterId} onActivateCharacter={setActiveCharacterId} />}
      {activeView === 'settings' && <SettingsView />}
    </AppShell>
  )
}
