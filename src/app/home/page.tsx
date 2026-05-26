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
import AdsView from '@/components/AdsView'
import AdPublisher from '@/components/AdPublisher'
import { startSession, trackTabSwitch, trackInteraction } from '@/lib/interaction-tracker'
// import PointBucket from '@/components/PointBucket' // Hidden until relevant (Fix #8)

// Only these emails can see the Ads tab and ad features
const ADS_ALLOWED_EMAILS = [
  '247ggtms@gmail.com',
  'testpersoni2026@gmail.com',
]

type View = 'chat' | 'feed' | 'threads' | 'create' | 'ads' | 'settings'

export default function HomePage() {
  const { user, loading } = useUser()
  const [activeView, setActiveView] = useState<View>('chat')
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [partnerMode, setPartnerMode] = useState(false)
  const [adPiece, setAdPiece] = useState<any>(null)
  const { messages } = useChat()
  const { characters, reload: reloadCharacters } = useCharacters()
  const [activeCharacterId, setActiveCharacterId] = useState<string | undefined>(undefined)

  // Check if current user is allowed to see ads features
  const isAdsAllowed = user?.email ? ADS_ALLOWED_EMAILS.includes(user.email) : false

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

  // Show onboarding if user hasn't completed it
  useEffect(() => {
    if (user && !(user as any).onboardingComplete) {
      setShowOnboarding(true)
    }
  }, [user])

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
      showAds={isAdsAllowed}
    >
      {activeView === 'chat' && (
        <ChatView
          threadId={activeThreadId}
          partnerMode={partnerMode}
          characterId={activeCharacterId}
          characters={characters}
          onCharacterChange={setActiveCharacterId}
          onGoToCreate={() => handleViewChange('create')}
          onPublishAsAd={isAdsAllowed ? (piece: any) => setAdPiece(piece) : undefined}
          onGoToThreads={() => handleViewChange('threads')}
        />
      )}
      {activeView === 'feed' && <FeedView />}
      {activeView === 'threads' && <ThreadsView onOpenThread={handleOpenThread} />}
      {activeView === 'create' && (
        <>
          <CharacterBuilder onGoToChat={() => handleViewChange('chat')} activeCharacterId={activeCharacterId} onActivateCharacter={setActiveCharacterId} />
          {isAdsAllowed && (
            <div className="px-4 pb-4">
              <button
                onClick={() => handleViewChange('ads')}
                className="w-full py-3 px-4 rounded-xl bg-continuum-surface border border-continuum-border hover:border-continuum-accent/40 transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-continuum-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                  <span className="text-sm font-medium text-continuum-text">Your Ads</span>
                </div>
                <svg className="w-4 h-4 text-continuum-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
      {isAdsAllowed && activeView === 'ads' && <AdsView />}
      {activeView === 'settings' && <SettingsView />}
      {isAdsAllowed && adPiece && (
        <AdPublisher
          piece={adPiece}
          onClose={() => setAdPiece(null)}
          onPublished={() => {
            setAdPiece(null)
            handleViewChange('ads')
          }}
        />
      )}
    </AppShell>
  )
}
