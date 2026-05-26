'use client'

import { useState, useEffect } from 'react'
import { TALKING_PROFILES, TalkingProfile } from '@/lib/bundles'

interface TalkingProfileBuilderProps {
  characterId: string
  characterName: string
  initialProfile?: {
    profileId?: string
    sliders?: { energy?: number; formality?: number; pace?: number; warmth?: number; humor?: number }
  }
  onSave: (profile: { profileId: string; sliders: { energy: number; formality: number; pace: number; warmth: number; humor: number } }) => void
  onBack: () => void
  mode?: 'auto' | 'guided'
  specs?: string
}

const SLIDER_LABELS: Record<string, { label: string; low: string; high: string; icon: string }> = {
  energy: { label: 'Energy', low: 'Calm', high: 'Intense', icon: 'â¡' },
  formality: { label: 'Formality', low: 'Casual', high: 'Formal', icon: 'ð' },
  pace: { label: 'Pace', low: 'Slow', high: 'Fast', icon: 'ð' },
  warmth: { label: 'Warmth', low: 'Cool', high: 'Warm', icon: 'â¤ï¸' },
  humor: { label: 'Humor', low: 'Serious', high: 'Funny', icon: 'ð' },
}

export default function TalkingProfileBuilder({
  characterId,
  characterName,
  initialProfile,
  onSave,
  onBack,
  mode,
  specs,
}: TalkingProfileBuilderProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(initialProfile?.profileId || null)
  const [sliders, setSliders] = useState<Record<string, number>>({
    energy: 50,
    formality: 50,
    pace: 50,
    warmth: 50,
    humor: 50,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showSliders, setShowSliders] = useState(!!initialProfile?.profileId)
  const [autoLoading, setAutoLoading] = useState(mode === 'auto')

  // When a profile is selected, set sliders to its defaults
  const selectProfile = (profile: TalkingProfile) => {
    setSelectedProfileId(profile.id)
    setSliders({ ...profile.defaults })
    setShowSliders(true)
    setSaved(false)
  }

  // Load initial slider values if editing
  useEffect(() => {
    if (initialProfile?.profileId) {
      const profile = TALKING_PROFILES.find(p => p.id === initialProfile.profileId)
      if (profile) {
        setSliders({
          energy: initialProfile.sliders?.energy ?? profile.defaults.energy,
          formality: initialProfile.sliders?.formality ?? profile.defaults.formality,
          pace: initialProfile.sliders?.pace ?? profile.defaults.pace,
          warmth: initialProfile.sliders?.warmth ?? profile.defaults.warmth,
          humor: initialProfile.sliders?.humor ?? profile.defaults.humor,
        })
      }
    }
  }, [initialProfile])

  // ============================================
  // AUTO MODE — AI picks profile + sliders, then saves
  // ============================================
  useEffect(() => {
    if (mode !== 'auto') return
    const run = async () => {
      try {
        const res = await fetch('/api/characters/ai-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: 'generate-talking-profile',
            characterId,
            characterName,
            specs: specs || '',
          }),
        })
        const data = await res.json()
        if (data.profileId && data.sliders) {
          const profile = TALKING_PROFILES.find(p => p.id === data.profileId)
          if (profile) {
            setSelectedProfileId(data.profileId)
            setSliders({
              energy: data.sliders.energy ?? profile.defaults.energy,
              formality: data.sliders.formality ?? profile.defaults.formality,
              pace: data.sliders.pace ?? profile.defaults.pace,
              warmth: data.sliders.warmth ?? profile.defaults.warmth,
              humor: data.sliders.humor ?? profile.defaults.humor,
            })
            setShowSliders(true)
            // Auto-save
            await onSave({
              profileId: data.profileId,
              sliders: {
                energy: data.sliders.energy ?? profile.defaults.energy,
                formality: data.sliders.formality ?? profile.defaults.formality,
                pace: data.sliders.pace ?? profile.defaults.pace,
                warmth: data.sliders.warmth ?? profile.defaults.warmth,
                humor: data.sliders.humor ?? profile.defaults.humor,
              },
            })
            setSaved(true)
          }
        }
      } catch (e) {
        console.error('Auto talking profile failed:', e)
      }
      setAutoLoading(false)
    }
    run()
  }, [mode])

  const handleSliderChange = (key: string, value: number) => {
    setSliders(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!selectedProfileId) return
    setSaving(true)
    try {
      await onSave({
        profileId: selectedProfileId,
        sliders: {
          energy: sliders.energy,
          formality: sliders.formality,
          pace: sliders.pace,
          warmth: sliders.warmth,
          humor: sliders.humor,
        },
      })
      setSaved(true)
    } catch (e) {
      console.error('Failed to save talking profile:', e)
    }
    setSaving(false)
  }

  const selectedProfile = selectedProfileId ? TALKING_PROFILES.find(p => p.id === selectedProfileId) : null


  // ============================================
  // AUTO MODE LOADING SCREEN
  // ============================================
  if (autoLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-4xl animate-bounce">🎤</div>
        <p className="text-white font-bold text-lg">AI is crafting the voice...</p>
        <p className="text-continuum-muted text-sm">Picking a talking style and tuning the sliders</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-continuum-bg to-continuum-card text-white px-4 py-8 max-w-2xl mx-auto">
      <button onClick={onBack} className="text-sm text-continuum-muted mb-6 hover:text-white transition">
        &larr; Back
      </button>

      <h1 className="text-2xl font-bold mb-2">ð¤ Talking Profile</h1>
      <p className="text-continuum-muted text-sm mb-8">
        Choose how <span className="text-white font-medium">{characterName}</span> speaks. Pick a voice type, then fine-tune it.
      </p>

      {/* Profile presets grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {TALKING_PROFILES.map(profile => (
          <button
            key={profile.id}
            onClick={() => selectProfile(profile)}
            className={`text-left p-4 rounded-xl border transition-all ${
              selectedProfileId === profile.id
                ? 'border-continuum-accent bg-continuum-accent/10 ring-1 ring-continuum-accent/50'
                : 'border-continuum-border bg-continuum-card hover:border-continuum-accent/40 hover:bg-continuum-card/80'
            }`}
          >
            <div className="text-2xl mb-2">{profile.emoji}</div>
            <div className="font-semibold text-sm mb-1">{profile.name}</div>
            <div className="text-xs text-continuum-muted leading-snug">{profile.desc}</div>
            <div className="mt-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                selectedProfileId === profile.id
                  ? 'bg-continuum-accent/20 text-continuum-accent'
                  : 'bg-continuum-border text-continuum-muted'
              }`}>
                {profile.tag}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Sliders section â shown after picking a profile */}
      {showSliders && selectedProfile && (
        <div className="bg-continuum-card border border-continuum-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">Fine-Tune: {selectedProfile.emoji} {selectedProfile.name}</h2>
          <p className="text-xs text-continuum-muted mb-6">
            Adjust the sliders to customize how {characterName} sounds. The preset gave you a starting point â make it yours.
          </p>

          <div className="space-y-6">
            {Object.entries(SLIDER_LABELS).map(([key, meta]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {meta.icon} {meta.label}
                  </span>
                  <span className="text-xs text-continuum-muted">{sliders[key]}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-continuum-muted w-16 text-right">{meta.low}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliders[key]}
                    onChange={e => handleSliderChange(key, parseInt(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-continuum-accent bg-continuum-border"
                  />
                  <span className="text-xs text-continuum-muted w-16">{meta.high}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Reset to preset defaults */}
          <button
            onClick={() => setSliders({ ...selectedProfile.defaults })}
            className="mt-4 text-xs text-continuum-muted hover:text-white transition"
          >
            Reset to {selectedProfile.name} defaults
          </button>
        </div>
      )}

      {/* Save button */}
      {selectedProfileId && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              saved
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-continuum-accent text-black hover:bg-continuum-accent/80'
            }`}
          >
            {saving ? 'Saving...' : saved ? 'â Saved!' : 'Save Talking Profile'}
          </button>
        </div>
      )}
    </div>
  )
}
