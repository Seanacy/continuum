'use client'

import { useState, useEffect, useCallback } from 'react'
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '@/lib/push-client'
import BusinessManager from './BusinessManager'

export default function SettingsView() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)
  const [location, setLocation] = useState<string>('')
  const [locationSaved, setLocationSaved] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [showBusinessManager, setShowBusinessManager] = useState(false)


  // Mission state
  const [mission, setMission] = useState<string>('')
  const [missionSaved, setMissionSaved] = useState(false)
  const [missionLoading, setMissionLoading] = useState(false)

  // Add More Links state
  const [linksText, setLinksText] = useState('')
  const [linkScanning, setLinkScanning] = useState(false)
  const [linkResult, setLinkResult] = useState<'success' | 'error' | null>(null)
  const [linkResultMsg, setLinkResultMsg] = useState('')

  // Load available voices
  const loadVoices = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const available = window.speechSynthesis.getVoices()
    // Filter to English voices for cleaner list
    const english = available.filter(
      (v) => v.lang.startsWith('en') || v.lang.startsWith('EN')
    )
    setVoices(english.length > 0 ? english : available)
  }, [])

  useEffect(() => {
    loadVoices()
    // Chrome loads voices async
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }, [loadVoices])

  // Load saved voice preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('continuum-voice')
      if (saved) setSelectedVoice(saved)
    }
  }, [])

  // Check push notification support and status
  useEffect(() => {
    setPushSupported(isPushSupported())
    if (isPushSupported()) {
      isPushSubscribed().then(setPushEnabled)
    }
  }, [])

  async function togglePush() {
    setPushLoading(true)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        const success = await subscribeToPush()
        setPushEnabled(success)
      }
    } catch {
      // fail silently
    }
    setPushLoading(false)
  }

  // Load user profile (location + mission)
  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.location) setLocation(data.profile.location)
        if (data.profile?.mission) setMission(data.profile.mission)
      })
      .catch(() => {})
  }, [])

  // Add More Links — scrape and save
  async function handleAddLinks() {
    if (!linksText.trim()) return
    setLinkScanning(true)
    setLinkResult(null)
    try {
      const res = await fetch('/api/onboarding/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: linksText }),
      })
      const data = await res.json()
      if (data.extracted) {
        // Save the scraped data as new memories
        await fetch('/api/onboarding/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business: data.extracted.business || null,
            personal: data.extracted.personal || null,
          }),
        })
        setLinkResult('success')
        setLinkResultMsg('Your AI learned new info from those links.')
        setLinksText('')
      } else {
        setLinkResult('error')
        setLinkResultMsg(data.error || 'Could not read those links. Try different ones.')
      }
    } catch {
      setLinkResult('error')
      setLinkResultMsg('Something went wrong. Try again.')
    }
    setLinkScanning(false)
    setTimeout(() => setLinkResult(null), 4000)
  }

  async function saveLocation() {
    setLocationLoading(true)
    try {
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
      })
      setLocationSaved(true)
      setTimeout(() => setLocationSaved(false), 2000)
    } catch {
      // fail silently
    }
    setLocationLoading(false)
  }

  async function saveMission() {
    setMissionLoading(true)
    try {
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission }),
      })
      setMissionSaved(true)
      setTimeout(() => setMissionSaved(false), 2000)
    } catch {
      // fail silently
    }
    setMissionLoading(false)
  }

  function selectVoice(voiceName: string) {
    setSelectedVoice(voiceName)
    if (typeof window !== 'undefined') {
      localStorage.setItem('continuum-voice', voiceName)
    }
  }

  function previewVoice(voice: SpeechSynthesisVoice) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    if (previewingVoice === voice.name) {
      setPreviewingVoice(null)
      return
    }

    const utterance = new SpeechSynthesisUtterance(
      "Hey, it's me. Just checking in — how's your day going?"
    )
    utterance.voice = voice
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.onstart = () => setPreviewingVoice(voice.name)
    utterance.onend = () => setPreviewingVoice(null)
    utterance.onerror = () => setPreviewingVoice(null)
    window.speechSynthesis.speak(utterance)
  }


  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-continuum-text mb-1">Settings</h2>
      <p className="text-sm text-continuum-muted mb-6">Customize your experience</p>

      {/* My Businesses */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-continuum-text mb-1">My Businesses</h3>
        <p className="text-xs text-continuum-muted mb-3">
          Add your businesses so Content Pack can create posts tailored to each one.
        </p>
        <button
          onClick={() => setShowBusinessManager(true)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-continuum-surface border border-continuum-border hover:border-continuum-accent/50 transition w-full"
        >
          <span className="text-base">🏢</span>
          <span className="text-sm text-continuum-text">Manage Businesses</span>
          <svg className="ml-auto w-4 h-4 text-continuum-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {showBusinessManager && (
        <BusinessManager onClose={() => setShowBusinessManager(false)} />
      )}

      {/* User Mission — Your WHY */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-continuum-text mb-1">What&apos;s Your Mission?</h3>
        <p className="text-xs text-continuum-muted mb-3">
          Your AI works best when it knows why you&apos;re here. Tell it why you&apos;re creating an AI character and what you need it to do. Give it your WHY.
        </p>
        <textarea
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="Example: I'm building a skincare brand and I want my AI to help me create content that gets followers and builds trust with my audience."
          className="w-full bg-continuum-surface border border-continuum-border rounded-xl px-3.5 py-2.5 text-sm text-continuum-text placeholder:text-continuum-muted focus:outline-none focus:border-continuum-accent resize-none mb-2"
          rows={4}
        />
        <button
          onClick={saveMission}
          disabled={missionLoading}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
            missionSaved
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25'
          }`}
        >
          {missionSaved ? 'Saved' : 'Save Mission'}
        </button>
      </div>

      {/* Add More Links — Teach Your AI */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-continuum-text mb-1">Teach Your AI More</h3>
        <p className="text-xs text-continuum-muted mb-3">
          Paste links to your website, social media, portfolio — anything. Your AI will read them and learn about you and your business.
        </p>
        <textarea
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          placeholder={"https://mywebsite.com\nhttps://instagram.com/myhandle\nhttps://linkedin.com/in/me"}
          rows={3}
          className="w-full px-3.5 py-2.5 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent transition resize-none mb-2"
        />
        {linkResult && (
          <p className={`text-xs mb-2 ${linkResult === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {linkResultMsg}
          </p>
        )}
        <button
          onClick={handleAddLinks}
          disabled={linkScanning || !linksText.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {linkScanning ? 'Scanning...' : 'Scan Links'}
        </button>
      </div>

      {/* Location */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-continuum-text mb-1">Your Location</h3>
        <p className="text-xs text-continuum-muted mb-3">
          Tell your AI where you are so it can be aware of your time, weather, and season.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Los Angeles, CA"
            className="flex-1 bg-continuum-surface border border-continuum-border rounded-xl px-3.5 py-2.5 text-sm text-continuum-text placeholder:text-continuum-muted focus:outline-none focus:border-continuum-accent"
          />
          <button
            onClick={saveLocation}
            disabled={locationLoading}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
              locationSaved
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25'
            }`}
          >
            {locationSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Push Notifications */}
      {pushSupported && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-continuum-text mb-1">Push Notifications</h3>
          <p className="text-xs text-continuum-muted mb-3">
            Let your AI reach you even when you&apos;re not on the site — reminders, thoughts, and nudges.
          </p>
          <button
            onClick={togglePush}
            disabled={pushLoading}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition w-full ${
              pushEnabled
                ? 'bg-emerald-500/15 border border-emerald-500/30'
                : 'bg-continuum-surface border border-continuum-border hover:border-continuum-accent/50'
            }`}
          >
            <div className={`w-10 h-6 rounded-full relative transition ${pushEnabled ? 'bg-emerald-500' : 'bg-continuum-border'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${pushEnabled ? 'left-5' : 'left-1'}`} />
            </div>
            <span className="text-sm text-continuum-text">
              {pushLoading ? 'Updating...' : pushEnabled ? 'Notifications on' : 'Notifications off'}
            </span>
          </button>
        </div>
      )}

      {/* Voice Selection */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-continuum-text mb-1">Emily&apos;s Voice</h3>
        <p className="text-xs text-continuum-muted mb-4">
          Pick a voice for your AI. Tap the play button to preview, tap the row to select.
        </p>

        {voices.length === 0 ? (
          <div className="text-sm text-continuum-muted py-8 text-center">
            No voices available on this device.
          </div>
        ) : (
          <div className="space-y-1.5">
            {voices.map((voice) => {
              const isSelected = selectedVoice === voice.name
              const isPreviewing = previewingVoice === voice.name

              return (
                <div
                  key={voice.name}
                  onClick={() => selectVoice(voice.name)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition ${
                    isSelected
                      ? 'bg-continuum-accent/15 border border-continuum-accent'
                      : 'bg-continuum-surface border border-continuum-border hover:border-continuum-accent/50'
                  }`}
                >
                  {/* Play/Preview button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      previewVoice(voice)
                    }}
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition ${
                      isPreviewing
                        ? 'bg-continuum-accent text-white animate-pulse'
                        : 'bg-continuum-surface border border-continuum-border text-continuum-muted hover:text-continuum-accent hover:border-continuum-accent'
                    }`}
                  >
                    {isPreviewing ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                  </button>

                  {/* Voice info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-continuum-text truncate">
                      {voice.name}
                    </div>
                    <div className="text-xs text-continuum-muted">
                      {voice.lang}
                      {voice.localService ? '' : ' · Cloud'}
                    </div>
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-continuum-accent flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        

      {/* Log Out */}
      <div className="mb-8 pt-4 border-t border-continuum-border">
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/login'
          }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition w-full"
        >
          <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="text-sm font-medium text-red-400">Log Out</span>
        </button>
      </div>
      </div>
    </div>
  )
}
