'use client'
import { useState, useEffect } from 'react'
import { CATEGORIES, getBundle } from '@/lib/bundles'

// ─── Types ───
interface ReminderConfig {
  enabled: boolean
  frequency: string
  time: string
  traits: string[]
  lastShown?: string
}

interface CharacterData {
  id: string
  name: string
  selections: Record<string, string>
  customizations: Record<string, any>
}

interface Props {
  character: CharacterData
  onBack: () => void
}

// ─── Constants ───
const FREQUENCIES = [
  { value: 'daily', label: 'Every Day', desc: 'Get a trait reminder each morning' },
  { value: 'weekdays', label: 'Weekdays Only', desc: 'Mon–Fri reminders' },
  { value: 'weekly', label: 'Once a Week', desc: 'Weekly personality recap' },
  { value: 'twice_daily', label: 'Twice Daily', desc: 'Morning & afternoon reminders' },
]

const CATEGORY_NAMES: Record<string, string> = {
  identity: 'Identity',
  backstory: 'Backstory',
  personality: 'Personality',
  commstyle: 'Communication Style',
  niche: 'Niche',
  preferences: 'Preferences',
  goals: 'Goals',
  boundaries: 'Boundaries',
  beliefs: 'Beliefs',
  sales: 'Sales Style',
  contentformat: 'Content Format',
}

// ─── Main Component ───
export default function RemindersPanel({ character, onBack }: Props) {
  const existing = character.customizations?.reminders as ReminderConfig | undefined
  const [config, setConfig] = useState<ReminderConfig>({
    enabled: existing?.enabled || false,
    frequency: existing?.frequency || 'daily',
    time: existing?.time || '09:00',
    traits: existing?.traits || [],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Get available traits from character selections
  const availableTraits = getPersonaTraits(character)

  function toggleTrait(key: string) {
    setConfig(prev => ({
      ...prev,
      traits: prev.traits.includes(key)
        ? prev.traits.filter(t => t !== key)
        : [...prev.traits, key],
    }))
  }

  function selectAllTraits() {
    setConfig(prev => ({
      ...prev,
      traits: availableTraits.map(t => t.key),
    }))
  }

  async function saveReminders() {
    setSaving(true)
    try {
      const res = await fetch('/api/characters/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          name: character.name,
          selections: character.selections,
          customizations: {
            ...character.customizations,
            reminders: config,
          },
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-continuum-bg text-continuum-text">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={onBack}
          className="text-sm text-continuum-muted hover:text-continuum-accent mb-3 flex items-center gap-1"
        >
          ← Back to Character
        </button>
        <h2 className="text-xl font-bold">
          🔔 Personality Reminders
        </h2>
        <p className="text-sm text-continuum-muted mt-1">
          Stay in character — get reminders of {character.name}&apos;s traits to keep your content consistent.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Enable Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div>
            <p className="text-sm font-medium">Enable Reminders</p>
            <p className="text-xs text-continuum-muted">
              {config.enabled ? 'Reminders are active' : 'Reminders are off'}
            </p>
          </div>
          <button
            onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              config.enabled ? 'bg-green-500' : 'bg-white/20'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              config.enabled ? 'left-6' : 'left-0.5'
            }`} />
          </button>
        </div>

        {config.enabled && (
          <>
            {/* Frequency */}
            <div>
              <p className="text-sm font-medium mb-2">Frequency</p>
              <div className="grid grid-cols-2 gap-2">
                {FREQUENCIES.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setConfig(prev => ({ ...prev, frequency: f.value }))}
                    className={`p-3 rounded-lg text-left transition-all ${
                      config.frequency === f.value
                        ? 'bg-continuum-accent/20 border border-continuum-accent/50'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-continuum-muted">{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Time Picker */}
            <div>
              <p className="text-sm font-medium mb-2">Reminder Time</p>
              <input
                type="time"
                value={config.time}
                onChange={(e) => setConfig(prev => ({ ...prev, time: e.target.value }))}
                className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-continuum-text text-sm focus:outline-none focus:border-continuum-accent"
              />
            </div>

            {/* Trait Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Which traits to remind you about?</p>
                {availableTraits.length > 0 && (
                  <button
                    onClick={selectAllTraits}
                    className="text-xs text-continuum-accent hover:text-continuum-accent/80"
                  >
                    Select All
                  </button>
                )}
              </div>

              {availableTraits.length === 0 ? (
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-sm text-continuum-muted">
                    No traits selected yet. Go back to the character builder and pick some personality traits first.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTraits.map(trait => {
                    const isSelected = config.traits.includes(trait.key)
                    return (
                      <button
                        key={trait.key}
                        onClick={() => toggleTrait(trait.key)}
                        className={`px-3 py-2 rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-continuum-accent/20 border border-continuum-accent/50 text-continuum-accent'
                            : 'bg-white/5 border border-white/10 text-continuum-muted hover:bg-white/10'
                        }`}
                      >
                        <span className="font-medium">{trait.category}</span>
                        <span className="block text-xs mt-0.5 truncate max-w-[150px]">{trait.value}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <p className="text-xs text-purple-300">
                🔔 Reminders help you stay consistent with your character&apos;s personality. You&apos;ll get
                a notification with your selected traits so every piece of content stays on-brand.
              </p>
            </div>
          </>
        )}

        {/* Save Button */}
        <button
          onClick={saveReminders}
          disabled={saving}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
            saved
              ? 'bg-green-500/20 text-green-400'
              : 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
          }`}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Reminder Settings'}
        </button>
      </div>
    </div>
  )
}

// ─── Notification Banner (for use in main app) ───
export function ReminderNotification({ character }: { character: CharacterData | null }) {
  const [dismissed, setDismissed] = useState(false)
  const [traits, setTraits] = useState<{ category: string; value: string }[]>([])

  useEffect(() => {
    if (!character) return
    const rem = character.customizations?.reminders as ReminderConfig | undefined
    if (!rem?.enabled || !rem.traits?.length) return
    if (!isReminderDue(rem)) return

    // Build trait list
    const t = getPersonaTraits(character).filter(tr => rem.traits.includes(tr.key))
    setTraits(t)
  }, [character])

  if (dismissed || !traits.length) return null

  const rem = character?.customizations?.reminders as ReminderConfig
  const freqLabel = FREQUENCIES.find(f => f.value === rem?.frequency)?.label || 'Daily'

  return (
    <div className="mx-4 mb-3 p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-green-500/20 border border-purple-500/30 animate-fade-in">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold">🔔 Trait Reminder: {character?.name}</p>
          <p className="text-xs text-continuum-muted mt-0.5">
            Stay in character! Here are {character?.name}&apos;s traits to keep in mind today:
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-continuum-muted hover:text-white text-sm"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {traits.map(t => (
          <span
            key={t.category}
            className="px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/20"
          >
            <strong>{t.category}:</strong> {t.value}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-continuum-muted">{freqLabel} at {rem?.time || '09:00'}</span>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-1 rounded-lg text-xs bg-continuum-accent/20 text-continuum-accent hover:bg-continuum-accent/30"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ───
function getPersonaTraits(character: CharacterData): { category: string; value: string; key: string }[] {
  const traits: { category: string; value: string; key: string }[] = []
  if (!character.selections) return traits

  for (const [key, bundleId] of Object.entries(character.selections)) {
    const catName = CATEGORY_NAMES[key]
    if (!catName) continue

    // Check for custom text first
    const customText = character.customizations?.[`${key}_custom`]
    if (customText) {
      traits.push({ category: catName, value: customText, key })
      continue
    }

    // Look up bundle
    const bundle = getBundle(key, bundleId)
    if (bundle) {
      traits.push({ category: catName, value: bundle.name, key })
    }
  }

  return traits
}

function isReminderDue(rem: ReminderConfig): boolean {
  if (!rem.enabled) return false

  const now = new Date()
  const [hours, minutes] = (rem.time || '09:00').split(':').map(Number)
  const reminderMinutes = hours * 60 + minutes
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // Not past reminder time yet
  if (currentMinutes < reminderMinutes) return false

  // Weekdays only — skip Sat/Sun
  if (rem.frequency === 'weekdays') {
    const day = now.getDay()
    if (day === 0 || day === 6) return false
  }

  // Never shown before — it's due
  if (!rem.lastShown) return true

  const lastShown = new Date(rem.lastShown)
  const hoursSince = (now.getTime() - lastShown.getTime()) / (1000 * 60 * 60)

  switch (rem.frequency) {
    case 'daily':
    case 'weekdays':
      return lastShown.toDateString() !== now.toDateString()
    case 'weekly':
      return hoursSince >= 168
    case 'twice_daily':
      return hoursSince >= 10
    default:
      return lastShown.toDateString() !== now.toDateString()
  }
}
