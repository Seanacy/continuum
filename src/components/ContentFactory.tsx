'use client'
import { useState, useEffect, useRef } from 'react'
import { getTraitReminders } from '@/lib/bundles'

// ─── Types ───
type Tab = 'ideas' | 'inspiration' | 'schedule' | 'drive' | 'generated'

interface CharacterData {
  id: string
  name: string
  selections: Record<string, string>
  customizations: Record<string, any>
  imageUrls: string[]
}

interface Props {
  character: CharacterData
  onBack: () => void
}

// ─── Main Component ───
export default function ContentFactory({ character, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('ideas')

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'ideas', label: 'Ideas', icon: '💡' },
    { key: 'inspiration', label: 'Photos', icon: '📸' },
    { key: 'schedule', label: 'Schedule', icon: '📅' },
    { key: 'drive', label: 'Storage', icon: '☁️' },
    { key: 'generated', label: 'Gallery', icon: '🎨' },
  ]

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
          🏭 Content Factory
        </h2>
        <p className="text-sm text-continuum-muted mt-1">
          AI-powered content ideas, scheduling, and management for {character.name}
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/10 px-2 mt-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-xs font-medium text-center transition-all ${
              activeTab === tab.key
                ? 'text-continuum-accent border-b-2 border-continuum-accent'
                : 'text-continuum-muted hover:text-continuum-text'
            }`}
          >
            <span className="block text-base mb-0.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'ideas' && <IdeasTab character={character} />}
        {activeTab === 'inspiration' && <InspirationTab character={character} />}
        {activeTab === 'schedule' && <ScheduleTab character={character} />}
        {activeTab === 'drive' && <DriveTab character={character} />}
        {activeTab === 'generated' && <GeneratedTab character={character} />}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// TAB 1: Content Ideas
// ═══════════════════════════════════════════
function IdeasTab({ character }: { character: CharacterData }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const reminders = getTraitReminders(character.selections || {})

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  if (reminders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">💡</p>
        <p className="text-continuum-muted">
          Select personality traits in the character builder to unlock content ideas.
        </p>
        <p className="text-xs text-continuum-muted mt-2">
          Each trait you pick generates a unique content prompt tailored to your character.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-continuum-muted mb-2">
        {reminders.length} content idea{reminders.length !== 1 ? 's' : ''} based on {character.name}&apos;s personality
      </p>
      {reminders.map((r, i) => (
        <IdeaCard
          key={i}
          reminder={r}
          index={i}
          copied={copiedIdx === i}
          onCopy={() => copyToClipboard(r, i)}
        />
      ))}
      <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-xs text-continuum-muted">
          💡 <strong>Pro tip:</strong> Copy a prompt and paste it into ChatGPT, Claude, or your AI of choice.
          Tell it to write in your character&apos;s voice for even better results.
        </p>
      </div>
    </div>
  )
}

function IdeaCard({
  reminder,
  index,
  copied,
  onCopy,
}: {
  reminder: string
  index: number
  copied: boolean
  onCopy: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-lg">💡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{reminder.length > 80 ? reminder.slice(0, 80) + "..." : reminder}</p>
        </div>
        <span className="text-continuum-muted text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5">
          <p className="text-sm text-continuum-text/80 mt-2 leading-relaxed">
            {reminder}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy() }}
            className={`mt-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              copied
                ? 'bg-green-500/20 text-green-400'
                : 'bg-continuum-accent/20 text-continuum-accent hover:bg-continuum-accent/30'
            }`}
          >
            {copied ? '✓ Copied!' : '📋 Copy Prompt'}
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// TAB 2: Inspiration Photos
// ═══════════════════════════════════════════
function InspirationTab({ character }: { character: CharacterData }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load existing inspiration photos from customizations
  useEffect(() => {
    const existing = character.customizations?.inspirationPhotos || []
    if (Array.isArray(existing)) setPhotos(existing)
  }, [character.customizations])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('characterId', character.id)
      formData.append('slot', `inspiration-${Date.now()}`)

      const res = await fetch('/api/characters/images', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Upload failed')

      // Add the new URL to local state
      if (data.url) {
        setPhotos(prev => [...prev, data.url])
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
    // Note: doesn't delete from storage — just removes from local view
  }

  return (
    <div>
      <p className="text-xs text-continuum-muted mb-3">
        Upload reference and inspiration photos for AI content generation.
        These help the Content Factory create on-brand visuals.
      </p>

      {/* Upload Button */}
      <label className={`block w-full p-4 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors ${
        uploading
          ? 'border-continuum-accent/30 bg-continuum-accent/5'
          : 'border-white/20 hover:border-continuum-accent/50 hover:bg-white/5'
      }`}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
          disabled={uploading}
        />
        {uploading ? (
          <span className="text-sm text-continuum-accent">Uploading...</span>
        ) : (
          <>
            <span className="text-2xl block mb-1">📸</span>
            <span className="text-sm text-continuum-muted">Tap to upload a photo</span>
          </>
        )}
      </label>

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}

      {/* Photo Grid */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mt-4">
          {photos.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
              <img src={url} alt={`Inspiration ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500/80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 mt-4">
          <p className="text-3xl mb-2">🖼️</p>
          <p className="text-sm text-continuum-muted">No inspiration photos yet</p>
          <p className="text-xs text-continuum-muted mt-1">
            Upload scene photos, mood boards, or aesthetic references
          </p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// TAB 3: Schedule
// ═══════════════════════════════════════════
function ScheduleTab({ character }: { character: CharacterData }) {
  const existing = character.customizations?.contentSchedule || {}
  const [enabled, setEnabled] = useState(existing.enabled || false)
  const [frequency, setFrequency] = useState(existing.frequency || 'daily')
  const [time, setTime] = useState(existing.time || '09:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const freqOptions = [
    { value: 'daily', label: 'Every Day', desc: '1 piece per day' },
    { value: '3x-week', label: '3x / Week', desc: 'Mon, Wed, Fri' },
    { value: 'weekly', label: 'Weekly', desc: '1 piece per week' },
  ]

  const handleSave = async () => {
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
            contentSchedule: { enabled, frequency, time },
          },
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-continuum-muted">
        Set up automatic content generation on a schedule.
      </p>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
        <div>
          <p className="text-sm font-medium">Auto-Generate Content</p>
          <p className="text-xs text-continuum-muted">
            {enabled ? 'Content will be generated on schedule' : 'Currently paused'}
          </p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            enabled ? 'bg-continuum-accent' : 'bg-white/20'
          }`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            enabled ? 'left-6' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* Frequency */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Frequency</p>
        {freqOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFrequency(opt.value)}
            className={`w-full p-3 rounded-lg text-left transition-all ${
              frequency === opt.value
                ? 'bg-continuum-accent/20 border border-continuum-accent/50'
                : 'bg-white/5 border border-white/10 hover:bg-white/10'
            }`}
          >
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-xs text-continuum-muted">{opt.desc}</p>
          </button>
        ))}
      </div>

      {/* Time Picker */}
      <div>
        <p className="text-sm font-medium mb-2">Generation Time</p>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-continuum-text text-sm focus:outline-none focus:border-continuum-accent"
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
          saved
            ? 'bg-green-500/20 text-green-400'
            : 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
        }`}
      >
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Schedule'}
      </button>

      <p className="text-xs text-continuum-muted text-center">
        Content will be generated and added to your Gallery tab automatically.
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════
// TAB 4: Google Drive / Storage
// ═══════════════════════════════════════════
function DriveTab({ character }: { character: CharacterData }) {
  const existing = character.customizations || {}
  const [connected, setConnected] = useState(existing.driveConnected || false)
  const [folderId, setFolderId] = useState(existing.driveFolderId || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
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
            driveConnected: connected,
            driveFolderId: folderId,
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
    <div className="space-y-4">
      <p className="text-xs text-continuum-muted">
        Connect cloud storage to automatically save generated content.
      </p>

      {/* Connection Toggle */}
      <div className="p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">☁️</span>
          <div>
            <p className="text-sm font-medium">Google Drive</p>
            <p className="text-xs text-continuum-muted">
              {connected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setConnected(!connected)}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
            connected
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-continuum-accent/20 text-continuum-accent hover:bg-continuum-accent/30'
          }`}
        >
          {connected ? 'Disconnect' : 'Connect Google Drive'}
        </button>
      </div>

      {/* Folder ID (only when connected) */}
      {connected && (
        <div>
          <p className="text-sm font-medium mb-2">Folder ID (optional)</p>
          <input
            type="text"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            placeholder="e.g. 1aBcD2eFgHiJkLmNoP"
            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-continuum-text text-sm placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent"
          />
          <p className="text-xs text-continuum-muted mt-1">
            Leave empty to save to root. Find your folder ID in the Google Drive URL.
          </p>
        </div>
      )}

      {connected && (
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
            saved
              ? 'bg-green-500/20 text-green-400'
              : 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
          }`}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      )}

      <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-xs text-continuum-muted">
          🔒 Google Drive OAuth integration coming soon. For now, you can save your folder ID
          and we&apos;ll connect it when the feature launches.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// TAB 5: Generated Content Gallery
// ═══════════════════════════════════════════
function GeneratedTab({ character }: { character: CharacterData }) {
  const generated: { url: string; date: string; type: string }[] =
    character.customizations?.generatedContent || []

  if (generated.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">🎨</p>
        <p className="font-medium mb-1">No content generated yet</p>
        <p className="text-sm text-continuum-muted">
          Set up a schedule or generate content from the Ideas tab.
          Your AI-created images, scripts, and videos will appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-continuum-muted mb-3">
        {generated.length} piece{generated.length !== 1 ? 's' : ''} of generated content
      </p>
      <div className="grid grid-cols-2 gap-2">
        {generated.map((item, i) => (
          <div key={i} className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
            {item.url ? (
              <img src={item.url} alt={`Generated ${i + 1}`} className="w-full aspect-square object-cover" />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center text-3xl bg-white/5">
                {item.type === 'video' ? '🎬' : item.type === 'script' ? '📝' : '🖼️'}
              </div>
            )}
            <div className="p-2">
              <p className="text-xs text-continuum-muted">{item.type || 'Image'}</p>
              {item.date && (
                <p className="text-xs text-continuum-muted/60">{new Date(item.date).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
