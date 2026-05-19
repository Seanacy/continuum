'use client'

import { useState, useEffect, useCallback } from 'react'
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '@/lib/push-client'

interface DiscoveryQuestion {
  id: string
  level: number
  question: string
  answer: string | null
}

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

  // Discovery questions state
  const [discoveryQuestions, setDiscoveryQuestions] = useState<DiscoveryQuestion[]>([])
  const [discoveryLevel, setDiscoveryLevel] = useState(1)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [editingAnswer, setEditingAnswer] = useState('')
  const [savingAnswer, setSavingAnswer] = useState(false)

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

  // Load user profile (location)
  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.location) setLocation(data.profile.location)
      })
      .catch(() => {})
  }, [])

  // Load discovery questions
  useEffect(() => {
    fetch('/api/user/discovery')
      .then((r) => r.json())
      .then((data) => {
        if (data.questions) setDiscoveryQuestions(data.questions)
        if (data.currentLevel) setDiscoveryLevel(data.currentLevel)
      })
      .catch(() => {})
  }, [])

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

  async function saveDiscoveryAnswer(questionId: string) {
    if (!editingAnswer.trim()) return
    setSavingAnswer(true)
    try {
      await fetch('/api/user/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer: editingAnswer.trim() }),
      })
      // Update local state
      setDiscoveryQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId ? { ...q, answer: editingAnswer.trim() } : q
        )
      )
      setEditingQuestion(null)
      setEditingAnswer('')
    } catch {
      // fail silently
    }
    setSavingAnswer(false)
  }

  const answeredCount = discoveryQuestions.filter((q) => q.answer).length
  const totalCount = discoveryQuestions.length

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-continuum-text mb-1">Settings</h2>
      <p className="text-sm text-continuum-muted mb-6">Customize your experience</p>

      {/* Discovery Questions — What Makes You Tick */}
      {discoveryQuestions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-continuum-text mb-1">What Makes You Tick</h3>
          <p className="text-xs text-continuum-muted mb-1">
            Help Emily understand who you really are. Answer at your own pace — or let her ask in conversation.
          </p>
          <p className="text-xs text-continuum-accent mb-4">
            Level {discoveryLevel} — {answeredCount}/{totalCount} answered
          </p>

          <div className="space-y-3">
            {discoveryQuestions.map((q) => {
              const isEditing = editingQuestion === q.id
              const hasAnswer = !!q.answer

              return (
                <div
                  key={q.id}
                  className={`rounded-xl border transition ${
                    hasAnswer
                      ? 'bg-continuum-surface/50 border-continuum-border'
                      : 'bg-continuum-surface border-continuum-border hover:border-continuum-accent/50'
                  }`}
                >
                  <div className="px-3.5 py-3">
                    <p className="text-sm text-continuum-text mb-1">{q.question}</p>

                    {isEditing ? (
                      <div className="mt-2">
                        <textarea
                          value={editingAnswer}
                          onChange={(e) => setEditingAnswer(e.target.value)}
                          placeholder="Be honest — this is just between you and Emily..."
                          className="w-full bg-continuum-bg border border-continuum-border rounded-lg px-3 py-2 text-sm text-continuum-text placeholder:text-continuum-muted focus:outline-none focus:border-continuum-accent resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => saveDiscoveryAnswer(q.id)}
                            disabled={savingAnswer || !editingAnswer.trim()}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25 transition disabled:opacity-30"
                          >
                            {savingAnswer ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingQuestion(null); setEditingAnswer('') }}
                            className="px-3 py-1.5 rounded-lg text-xs text-continuum-muted hover:text-continuum-text transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : hasAnswer ? (
                      <div className="mt-1">
                        <p className="text-xs text-continuum-muted leading-relaxed">{q.answer}</p>
                        <button
                          onClick={() => { setEditingQuestion(q.id); setEditingAnswer(q.answer || '') }}
                          className="text-xs text-continuum-accent mt-1.5 hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingQuestion(q.id); setEditingAnswer('') }}
                        className="text-xs text-continuum-accent mt-1 hover:underline"
                      >
                        Answer this
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {discoveryLevel < 3 && answeredCount === totalCount && totalCount > 0 && (
            <div className="mt-4 px-3.5 py-3 rounded-xl bg-continuum-accent/10 border border-continuum-accent/20">
              <p className="text-xs text-continuum-accent">
                Level {discoveryLevel} complete. Level {discoveryLevel + 1} questions coming soon.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Location */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-continuum-text mb-1">Your Location</h3>
        <p className="text-xs text-continuum-muted mb-3">
          Tell Emily where you are so she can be aware of your time, weather, and season.
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
            Let Emily reach you even when you&apos;re not on the site — reminders, thoughts, and nudges.
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
          Pick a voice for Emily. Tap the play button to preview, tap the row to select.
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
      </div>
    </div>
  )
}
