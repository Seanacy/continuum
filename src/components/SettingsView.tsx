'use client'

import { useState, useEffect, useCallback } from 'react'

export default function SettingsView() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)

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

  // Load saved preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('continuum-voice')
      if (saved) setSelectedVoice(saved)
    }
  }, [])

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
