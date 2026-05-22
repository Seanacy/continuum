'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  CATEGORIES,
  TEMPLATES,
  fuzzySearch,
  suggestContentPillars,
  getBundle,
  getSelectionSummary,
  type Bundle,
  type Category,
  type Template,
} from '@/lib/bundles'
import VisualCreator from './VisualCreator'
import ContentFactory from './ContentFactory'
import RemindersPanel from './RemindersPanel'
import BuildAssistant from './BuildAssistant'
import ImageCarousel from './ImageCarousel'
import TalkingProfileBuilder from './TalkingProfileBuilder'

// ============================================
// TYPES
// ============================================
type BuildMode = 'pick' | 'instant' | 'custom' | 'premium'
type Step = 'list' | 'mode' | 'template' | 'category' | 'review' | 'visual' | 'content' | 'reminders' | 'voice' | 'assistant'

interface Selections {
  [categoryKey: string]: string // categoryKey -> bundleId
}

interface Customizations {
  [key: string]: string // e.g. "identity_custom" -> custom text
}

// ============================================
// MAIN COMPONENT
// ============================================
interface CharacterBuilderProps {
  onGoToChat?: () => void
  activeCharacterId?: string
  onActivateCharacter?: (characterId: string) => void
}

export default function CharacterBuilder({ onGoToChat, activeCharacterId, onActivateCharacter }: CharacterBuilderProps) {
  const [step, setStep] = useState<Step>('list')
  const [buildMode, setBuildMode] = useState<BuildMode>('pick')
  const [selections, setSelections] = useState<Selections>({})
  const [customizations, setCustomizations] = useState<Customizations>({})
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [characterName, setCharacterName] = useState('')
  const [nicheType, setNicheType] = useState('')
  const [nicheAudience, setNicheAudience] = useState('')
  const [missionStatement, setMissionStatement] = useState('')
  const [uniqueEdge, setUniqueEdge] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [existingCharacter, setExistingCharacter] = useState<any>(null)
  const [allCharacters, setAllCharacters] = useState<any[]>([])
  const [loadingCharacter, setLoadingCharacter] = useState(true)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

    // Image upload handler
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleImageUpload = useCallback(async (characterId: string, imageType: string, file: File) => {
    setUploadingSlot(imageType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('characterId', characterId)
      formData.append('imageType', imageType)
      const res = await fetch('/api/characters/visual-images', { method: 'POST', body: formData })
      if (res.ok) {
        // Refresh characters list
        const refreshRes = await fetch('/api/characters/mine')
        if (refreshRes.ok) {
          const data = await refreshRes.json()
          setAllCharacters(data?.characters || [])
        }
      }
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setUploadingSlot(null)
    }
  }, [])

// Load all characters on mount
  useEffect(() => {
    fetch('/api/characters/mine')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const chars = data?.characters || []
        setAllCharacters(chars)
        // If no characters exist, skip straight to mode picker (create new)
        if (chars.length === 0) {
          setStep('mode')
        }
      })
      .catch(() => { setStep('mode') })
      .finally(() => setLoadingCharacter(false))
  }, [])

  // Load a specific character's data into the form
  function loadCharacter(c: any) {
    setExistingCharacter(c)
    setCharacterName(c.name || '')
    setSelections(c.selections && typeof c.selections === 'object' ? c.selections : {})
    setCustomizations(c.customizations && typeof c.customizations === 'object' ? c.customizations : {})
    setNicheType(c.nicheType || '')
    setNicheAudience(c.nicheAudience || '')
    setMissionStatement(c.missionStatement || '')
    setUniqueEdge(c.uniqueEdge || '')
    setStep('mode')
  }

  // Start creating a brand new character (clear all fields)
  function startNewCharacter() {
    setExistingCharacter(null)
    setCharacterName('')
    setSelections({})
    setCustomizations({})
    setNicheType('')
    setNicheAudience('')
    setMissionStatement('')
    setUniqueEdge('')
    setCurrentCategoryIndex(0)
    setStep('mode')
  }

  // Detect which template a character was built from by comparing selections
  function getTemplateType(charSelections: any): string | null {
    if (!charSelections || typeof charSelections !== 'object') return null
    for (const t of TEMPLATES) {
      const tKeys = Object.keys(t.selections)
      const matches = tKeys.filter(k => t.selections[k] === charSelections[k])
      // If 70%+ of template selections match, it's this template type
      if (matches.length >= Math.ceil(tKeys.length * 0.7)) return t.name
    }
    return null
  }

  // Save just the name for a character (inline rename)
  async function renameCharacter(charId: string, newName: string) {
    if (!newName.trim()) return
    try {
      const char = allCharacters.find(c => c.id === charId)
      if (!char) return
      await fetch('/api/characters/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: charId,
          name: newName.trim(),
          selections: char.selections || {},
          customizations: char.customizations || {},
          nicheType: char.nicheType || '',
          nicheAudience: char.nicheAudience || '',
          missionStatement: char.missionStatement || '',
          uniqueEdge: char.uniqueEdge || '',
          contentPillars: char.contentPillars || [],
        }),
      })
      // Update local state
      setAllCharacters(prev =>
        prev.map(c => c.id === charId ? { ...c, name: newName.trim() } : c)
      )
    } catch (e) {
      console.error('Failed to rename character', e)
    }
    setEditingNameId(null)
  }

  // Derived
  const currentCategory = CATEGORIES[currentCategoryIndex]
  const categoryBundles = currentCategory ? fuzzySearch('', currentCategory.key) : []
  const searchResults = searchQuery.length >= 2 ? fuzzySearch(searchQuery) : []
  const contentPillars = useMemo(() => {
    if (selections.niche) {
      return suggestContentPillars(selections)
    }
    return []
  }, [selections])

  const selectionCount = Object.keys(selections).length
  const totalCategories = CATEGORIES.length

  // ============================================
  // HANDLERS
  // ============================================
  function selectBundle(categoryKey: string, bundleId: string) {
    setSelections(prev => ({ ...prev, [categoryKey]: bundleId }))
  }

  function setCustomText(categoryKey: string, text: string) {
    setCustomizations(prev => ({ ...prev, [`${categoryKey}_custom`]: text }))
  }

  function applyTemplate(template: Template) {
    setSelections(template.selections)
    setCharacterName(template.name)
    setStep('review')
  }

  function nextCategory() {
    if (currentCategoryIndex < CATEGORIES.length - 1) {
      setCurrentCategoryIndex(prev => prev + 1)
      setSearchQuery('')
    } else {
      setStep('review')
    }
  }

  function prevCategory() {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex(prev => prev - 1)
      setSearchQuery('')
    } else {
      setStep('mode')
    }
  }

  async function saveCharacter() {
    if (!characterName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/characters/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: existingCharacter?.id,
          name: characterName,
          selections,
          customizations,
          nicheType,
          nicheAudience,
          missionStatement,
          uniqueEdge,
          contentPillars,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setExistingCharacter(data.character)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        // Refresh the character list so the list screen stays in sync
        fetch('/api/characters/mine')
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.characters) setAllCharacters(d.characters) })
          .catch(() => {})
      }
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // LOADING STATE
  // ============================================
  if (loadingCharacter) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-continuum-muted animate-pulse">Loading character...</span>
      </div>
    )
  }

  // ============================================
  // CHARACTER LIST — dashboard-style persona cards
  // ============================================
  if (step === 'list') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-1">My Characters</h2>
          <p className="text-sm text-continuum-muted mb-6">
            Manage and chat with your AI personalities.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allCharacters.map((c: any) => {
              const traitCount = c.selections && typeof c.selections === 'object'
                ? Object.keys(c.selections).length : 0
              const templateType = getTemplateType(c.selections)

              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-continuum-border bg-continuum-surface p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {c.characterImages?.length > 0 ? (
                      <ImageCarousel images={c.characterImages} size="sm" />
                    ) : c.imageUrls?.[0] ? (
                      <img src={c.imageUrls[0]} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-12 h-12 rounded-full bg-continuum-accent/20 flex items-center justify-center text-continuum-accent font-bold text-xl flex-shrink-0">
                        {c.name?.[0] || '?'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      {editingNameId === c.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameCharacter(c.id, editingNameValue)
                              if (e.key === 'Escape') setEditingNameId(null)
                            }}
                            autoFocus
                            className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-continuum-bg border border-continuum-accent text-white text-lg font-bold outline-none"
                          />
                          <button
                            onClick={() => renameCharacter(c.id, editingNameValue)}
                            className="text-green-400 hover:text-green-300 text-sm font-semibold"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingNameId(null)}
                            className="text-continuum-muted hover:text-white text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-white truncate">{c.name}</h3>
                          <button
                            onClick={() => { setEditingNameId(c.id); setEditingNameValue(c.name || '') }}
                            className="text-continuum-muted hover:text-continuum-accent transition shrink-0"
                            title="Rename character"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {templateType && (
                        <p className="text-xs text-continuum-accent/70 mt-0.5">{templateType}</p>
                      )}
                      <p className="text-xs text-continuum-muted">
                        {traitCount} traits selected{c.nicheType ? ` — ${c.nicheType}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-continuum-muted mb-4">
                    <span>Traits: <strong className="text-continuum-accent">{traitCount}/{totalCategories}</strong></span>
                  </div>

                  {/* Profile Picture Gallery */}
                  {(() => {
                    const typeOrder = ['head_front', 'head_right', 'head_left', 'body_front', 'body_right', 'body_left'] as const
                    const typeLabels: Record<string, string> = {
                      head_front: 'Front Face Profile',
                      head_right: 'Right Face Profile',
                      head_left: 'Left Face Profile',
                      body_front: 'Front Body Profile',
                      body_right: 'Right Body Profile',
           body_left: 'Left Body Profile'
                    }
                    const imageMap = new Map(c.characterImages?.map((img: any) => [img.imageType, img.imageUrl]) || [])
                    return (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {typeOrder.map(t => {
                          const url = imageMap.get(t) as string | undefined
                          return (
                            <div key={t} className="flex flex-col items-center gap-1">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={el => { fileInputRefs.current[c.id + '_' + t] = el }}
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (file) handleImageUpload(c.id, t, file)
                                  e.target.value = ''
                                }}
                              />
                              <div
                                className="w-full aspect-square rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-continuum-accent/50 transition-all relative group"
                                onClick={() => fileInputRefs.current[c.id + '_' + t]?.click()}
                              >
                                {url ? (
                                  <img src={url} alt={typeLabels[t] || ''} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-continuum-glass/30 flex items-center justify-center">
                                    <span className="text-continuum-muted/40 text-lg">+</span>
                                  </div>
                                )}
                                {uploadingSlot === t ? (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                                    <span className="text-white/0 group-hover:text-white/80 text-xs font-medium transition-all">
                                      {url ? 'Change' : 'Upload'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[9px] text-continuum-muted/60 text-center leading-tight">{typeLabels[t]}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                })()}

                  <div className="space-y-2">
                    {activeCharacterId === c.id ? (
                      <div className="w-full py-2 rounded-lg text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 text-center">
                        Active AI
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          if (onActivateCharacter) {
                            try {
                              await fetch('/api/characters/activate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ characterId: c.id })
                              })
                              onActivateCharacter?.(c.id)
                            } catch (e) {
                              console.error('Failed to activate character', e)
                            }
                          }
                        }}
                        className="w-full py-2 rounded-lg text-xs font-semibold bg-continuum-accent text-black hover:bg-continuum-accent/80 transition-all"
                      >
                        Use This AI
                      </button>
                    )}
                    <button
                      onClick={() => loadCharacter(c)}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/30 transition-all"
                    >
                      ✏️ Edit Character
                    </button>
                    <button
                      onClick={() => { loadCharacter(c); setStep('visual') }}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
                    >
                      🎨 Create Their Look
                    </button>
                    <button
                      onClick={() => { loadCharacter(c); setStep('content') }}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
                    >
                      🏭 Content Factory
                    </button>
                    <button
                      onClick={() => { loadCharacter(c); setStep('reminders') }}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all"
                    >
                      🔔 Reminders
                    </button>
                  </div>
                </div>
              )
            })}

            {allCharacters.length < 5 && (
              <button
                onClick={startNewCharacter}
                className="rounded-xl border-2 border-dashed border-continuum-border hover:border-continuum-accent/50 bg-transparent p-5 flex flex-col items-center justify-center gap-3 min-h-[200px] transition-all"
              >
                <span className="text-4xl text-continuum-muted">+</span>
                <span className="text-base font-semibold text-continuum-muted">Create New Character</span>
              </button>
            )}
          </div>

          {allCharacters.length >= 5 && (
            <p className="text-xs text-continuum-muted text-center mt-4">
              You&apos;ve reached the 5-character limit. Deactivate one to create a new one.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // MODE PICKER — 3-column Personi-style layout
  // ============================================
  if (step === 'mode') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Back button for existing characters */}
          {allCharacters.length > 0 && (
            <button onClick={() => setStep('list')} className="text-sm text-continuum-muted mb-6 hover:text-white transition">
              ← My Characters
            </button>
          )}

          <h2 className="text-3xl font-bold text-white text-center mb-2">
            {existingCharacter ? `Edit ${existingCharacter.name}` : 'How Do You Want to Build?'}
          </h2>
          <p className="text-sm text-continuum-muted text-center mb-8">
            Pick your speed. You can always go deeper later.
          </p>

          {/* 3-column mode cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {/* Instant Character */}
            <button
              onClick={() => { setBuildMode('instant'); setStep('template') }}
              className="relative rounded-xl border border-continuum-border bg-continuum-surface p-6 text-center hover:border-continuum-accent/50 transition-all flex flex-col items-center"
            >
              <span className="text-4xl mb-3">⚡</span>
              <span className="text-sm text-continuum-accent font-medium mb-2">~2 min</span>
              <h3 className="text-lg font-bold text-white mb-3 leading-tight">Instant<br />Character</h3>
              <p className="text-sm text-continuum-muted mb-5">
                We pick everything for you. Just name it and go. Swap any trait later if you want.
              </p>
              <div className="text-left w-full space-y-2 mb-5">
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Auto-filled traits</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Ready to chat immediately</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Edit anytime</span>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-continuum-border w-full">
                <span className="text-sm font-semibold text-continuum-accent">Start Instantly →</span>
              </div>
            </button>

            {/* Custom Character — Most Popular */}
            <button
              onClick={() => { setBuildMode('custom'); setCurrentCategoryIndex(0); setStep('category') }}
              className="relative rounded-xl border border-purple-500/50 bg-continuum-surface p-6 text-center hover:border-purple-400/70 transition-all flex flex-col items-center"
            >
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-continuum-accent text-white text-xs font-bold rounded-full">
                Most Popular
              </span>
              <span className="text-4xl mb-3">🎯</span>
              <span className="text-sm text-continuum-accent font-medium mb-2">~15 min</span>
              <h3 className="text-lg font-bold text-white mb-3 leading-tight">Custom<br />Character</h3>
              <p className="text-sm text-continuum-muted mb-5">
                Walk through each category and pick the bundles that fit. Simple guided steps.
              </p>
              <div className="text-left w-full space-y-2 mb-5">
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Step-by-step wizard</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Pick from 190+ bundles</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Optional customization</span>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-continuum-border w-full">
                <span className="text-sm font-semibold text-continuum-accent">Start Building →</span>
              </div>
            </button>

            {/* Premium Character */}
            <button
              onClick={() => { setBuildMode('premium'); setCurrentCategoryIndex(0); setStep('category') }}
              className="relative rounded-xl border border-continuum-border bg-continuum-surface p-6 text-center hover:border-continuum-accent/50 transition-all flex flex-col items-center"
            >
              <span className="text-4xl mb-3">💎</span>
              <span className="text-sm text-continuum-accent font-medium mb-2">~45 min</span>
              <h3 className="text-lg font-bold text-white mb-3 leading-tight">Premium<br />Character</h3>
              <p className="text-sm text-continuum-muted mb-5">
                Full control. Every step opens the editor so you canwrite backstory, catchphrases, and fine details.
              </p>
              <div className="text-left w-full space-y-2 mb-5">
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Deep customization on every trait</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Backstory &amp; speech patterns</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-continuum-muted">
                  <span className="text-continuum-accent mt-0.5">✓</span>
                  <span>Maximum personality depth</span>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-continuum-border w-full">
                <span className="text-sm font-semibold text-continuum-accent">Go Deep →</span>
              </div>
            </button>
          </div>

          {/* Template pills */}
          <div className="text-center mb-8">
            <p className="text-sm text-continuum-muted mb-4">Or start from a template:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="px-4 py-2 rounded-full border border-continuum-border bg-continuum-surface text-sm text-white hover:border-continuum-accent/50 transition-all"
                >
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Existing character quick-access buttons */}
          {existingCharacter && Object.keys(existingCharacter.selections || {}).length > 0 && (
            <div className="border-t border-continuum-border pt-6 mt-2">
              <h3 className="text-sm font-semibold text-white text-center mb-4">Quick Actions for {existingCharacter.name}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
                <button
                  onClick={() => setStep('review')}
                  className="py-3 rounded-xl text-xs font-semibold bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/30 transition-all"
                >
                  ✏️ Quick Edit
                </button>
                <button
                  onClick={() => setStep('visual')}
                  className="py-3 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
                >
                  🎨 Create Look
                </button>
                <button
                  onClick={() => setStep('content')}
                  className="py-3 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
                >
                  🏭 Content
                </button>
                <button
                  onClick={() => setStep('reminders')}
                  className="py-3 rounded-xl text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all"
                >
                  🔔 Reminders
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // TEMPLATE PICKER — Personi-style 2-column cards
  // ============================================
  if (step === 'template') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setStep('mode')} className="text-sm text-continuum-muted mb-6 hover:text-white transition">
            ← Back
          </button>

          <h2 className="text-3xl font-bold text-white text-center mb-2">Pick a Template</h2>
          <p className="text-sm text-continuum-muted text-center mb-8">
            Each template comes with a full personality pre-built. You can customize everything later.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="text-left p-5 rounded-xl border border-continuum-border bg-continuum-surface hover:border-continuum-accent/50 transition-all"
              >
                <span className="text-3xl block mb-2">{t.emoji}</span>
                <h3 className="text-base font-bold text-white mb-1">{t.name}</h3>
                <p className="text-sm text-continuum-muted leading-snug">{t.desc}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-continuum-accent">
                  <span>✓</span>
                  <span>11 traits pre-filled</span>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-continuum-border pt-5 mt-8 text-center">
            <p className="text-sm text-continuum-muted">Or go back and choose a different build mode</p>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // CATEGORY BUILDER — Personi-style 2-column card grid
  // ============================================
  if (step === 'category' && currentCategory) {
    const selectedBundleId = selections[currentCategory.key]
    const customText = customizations[`${currentCategory.key}_custom`] || ''
    const displayBundles = searchQuery.length >= 2
      ? fuzzySearch(searchQuery, currentCategory.key)
      : categoryBundles

    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Step counter */}
          <p className="text-sm font-bold text-continuum-accent text-center mb-4 tracking-wide">
            STEP {currentCategoryIndex + 1} OF {totalCategories}
          </p>

          {/* Category icon + name */}
          <div className="text-center mb-2">
            <span className="text-5xl">{currentCategory.icon}</span>
            <h2 className="text-3xl font-bold text-white mt-2">{currentCategory.label}</h2>
          </div>
          <p className="text-sm text-continuum-muted text-center mb-8">
            Pick one that fits your character (or skip)
          </p>

          {/* Search — only show if many bundles */}
          {categoryBundles.length > 8 && (
            <div className="relative mb-6 max-w-md mx-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={`Search ${currentCategory.label.toLowerCase()}...`}
                className="w-full px-4 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-continuum-muted hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* 2-column bundle card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {displayBundles.map(bundle => (
              <button
                key={bundle.id}
                onClick={() => selectBundle(currentCategory.key, bundle.id)}
                className={`text-left p-5 rounded-xl border transition-all ${
                  selectedBundleId === bundle.id
                    ? 'border-continuum-accent bg-continuum-accent/10'
                    : 'border-continuum-border bg-continuum-surface hover:border-continuum-accent/30'
                }`}
              >
                <span className="text-3xl block mb-2">{bundle.emoji}</span>
                <h3 className={`text-base font-bold mb-1 ${
                  selectedBundleId === bundle.id ? 'text-continuum-accent' : 'text-white'
                }`}>
                  {bundle.name}
                </h3>
                <p className="text-sm text-continuum-muted leading-snug">{bundle.desc}</p>
                {bundle.tag && (
                  <div className="mt-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
                      {bundle.tag}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Custom text — expanded for premium mode */}
          {buildMode === 'premium' && (
            <div className="mb-6 max-w-xl mx-auto">
              <label className="text-xs text-continuum-muted block mb-1">
                Write your own (optional):
              </label>
              <textarea
                value={customText}
                onChange={e => setCustomText(currentCategory.key, e.target.value)}
                placeholder={`Describe your character's ${currentCategory.label.toLowerCase()} in your own words...`}
                rows={4}
                className="w-full px-3 py-2 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none"
              />
            </div>
          )}

          {/* Bottom navigation — Back / Skip / Next */}
          <div className="border-t border-continuum-border pt-5 mt-4">
            <div className="flex items-center justify-between">
              <button
                onClick={prevCategory}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white hover:border-continuum-accent/30 transition"
              >
                ← Back
              </button>
              <button
                onClick={nextCategory}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white transition"
              >
                Skip
              </button>
              <button
                onClick={nextCategory}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition ${
                  selectedBundleId || customText
                    ? 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
                    : 'bg-continuum-accent/50 text-white/70'
                }`}
              >
                {currentCategoryIndex === totalCategories - 1 ? 'Review Build' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // REVIEW — Personi-style 4-column trait grid + save
  // ============================================
  if (step === 'review') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <h2 className="text-3xl font-bold text-white text-center mb-2">Review Your Character</h2>
          <p className="text-sm text-continuum-muted text-center mb-8">
            {selectionCount} traits selected — tap any to change it
          </p>

          {/* 4-column trait card grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
            {CATEGORIES.map(cat => {
              const bundleId = selections[cat.key]
              const bundle = bundleId ? getBundle(cat.key, bundleId) : null
              const custom = customizations[`${cat.key}_custom`]
              const hasValue = bundle || custom

              return (
                <button
                  key={cat.key}
                  onClick={() => {
                    const idx = CATEGORIES.findIndex(c => c.key === cat.key)
                    setCurrentCategoryIndex(idx)
                    setBuildMode('custom')
                    setStep('category')
                  }}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    hasValue
                      ? 'border-continuum-accent/40 bg-continuum-accent/5'
                      : 'border-continuum-border bg-continuum-surface hover:border-continuum-accent/30'
                  }`}
                >
                  <p className="text-xs text-continuum-accent font-medium mb-1">{cat.icon}{cat.label}</p>
                  <span className="text-2xl block mb-1">
                    {bundle ? bundle.emoji : '❓'}
                  </span>
                  <p className="text-sm font-bold text-white leading-tight">
                    {bundle ? bundle.name : custom ? 'Custom' : 'Not Set'}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Niche Details — collapsible section */}
          <div className="rounded-xl border border-continuum-border bg-continuum-surface p-5 mb-6">
            <h3 className="text-base font-bold text-white mb-4">Niche Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-continuum-muted block mb-1">Niche / Industry</label>
                <input
                  type="text"
                  value={nicheType}
                  onChange={e => setNicheType(e.target.value)}
                  placeholder="e.g. Fitness, Beauty, Tech..."
                  className="w-full px-3 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-continuum-muted block mb-1">Target Audience</label>
                <input
                  type="text"
                  value={nicheAudience}
                  onChange={e => setNicheAudience(e.target.value)}
                  placeholder="Who is your character speaking to?"
                  className="w-full px-3 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-continuum-muted block mb-1">Mission Statement</label>
                <textarea
                  value={missionStatement}
                  onChange={e => setMissionStatement(e.target.value)}
                  placeholder="What is your character's purpose?"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-continuum-muted block mb-1">Unique Edge</label>
                <input
                  type="text"
                  value={uniqueEdge}
                  onChange={e => setUniqueEdge(e.target.value)}
                  placeholder="What makes them stand out?"
                  className="w-full px-3 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Content pillars */}
          {contentPillars.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white mb-2">Suggested Content Pillars</h3>
              <div className="flex flex-wrap gap-2">
                {contentPillars.map((pillar, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300"
                  >
                    {pillar}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Name Your Character — centered */}
          <div className="text-center mb-6">
            <h3 className="text-base font-bold text-white mb-3">Name Your Character</h3>
            <input
              type="text"
              value={characterName}
              onChange={e => setCharacterName(e.target.value)}
              placeholder="e.g. Luna, Coach Mike, Sage..."
              className="w-full max-w-sm mx-auto px-4 py-3 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none text-center"
            />
          </div>

          {/* Save button — big and centered */}
          <div className="text-center">
            <button
              onClick={saveCharacter}
              disabled={saving || !characterName.trim()}
              className={`px-10 py-3.5 rounded-xl text-base font-semibold transition-all ${
                saving
                  ? 'bg-continuum-surface text-continuum-muted cursor-wait'
                  : saved
                    ? 'bg-green-600 text-white'
                    : !characterName.trim()
                      ? 'bg-continuum-surface text-continuum-muted cursor-not-allowed'
                      : 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
              }`}
            >
              {saving
                ? 'Saving...'
                : saved
                  ? '✓ Character Saved!'
                  : existingCharacter
                    ? `Update Character (${selectionCount}/${totalCategories} traits)`
                    : `Save Character (${selectionCount}/${totalCategories} traits)`
              }
            </button>
          </div>

          {saved && (
            <div className="text-center mt-4">
              <p className="text-xs text-green-400 mb-3">
                Your character is live!
              </p>
              {onGoToChat && (
                <button
                  onClick={onGoToChat}
                  className="px-8 py-3 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition-all"
                >
                  Back to Chat →
                </button>
              )}
            </div>
          )}

          {/* Feature buttons — matching Personi's dashboard card style */}
          {existingCharacter && (
            <div className="border-t border-continuum-border pt-6 mt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setStep('visual')}
                  className="py-3 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
                >
                  🎨 Create Their Look
                </button>
                <button
                  onClick={() => setStep('content')}
                  className="py-3 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
                >
                  🏭 Content Factory
                </button>
                <button
                  onClick={() => setStep('reminders')}
                  className="py-3 rounded-xl text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all"
                >
                  🔔 Reminders
                </button>
                <button
                  onClick={() => setStep('assistant')}
                  className="py-3 rounded-xl text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-all"
                >
                  🤖 Build Assistant
                </button>
              </div>
            </div>
          )}

          {/* Back to Builder */}
          <div className="text-center mt-6">
            <button
              onClick={() => {
                if (buildMode === 'custom' || buildMode === 'premium') {
                  setStep('category')
                } else {
                  setStep('mode')
                }
              }}
              className="text-sm text-continuum-muted hover:text-white transition border border-continuum-border rounded-lg px-5 py-2.5"
            >
              ← Back to Builder
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // VISUAL CREATOR — Create Their Look
  // ============================================
  if (step === 'visual' && existingCharacter) {
    return (
      <VisualCreator
        character={{
          id: existingCharacter.id,
          name: existingCharacter.name || characterName,
          selections: selections,
          customizations: existingCharacter.customizations && typeof existingCharacter.customizations === 'object'
            ? existingCharacter.customizations as Record<string, any>
            : {},
          nicheType: nicheType || existingCharacter.nicheType || undefined,
          visualTraits: existingCharacter.visualTraits && typeof existingCharacter.visualTraits === 'object'
            ? existingCharacter.visualTraits as Record<string, any>
            : undefined,
          characterImages: Array.isArray(existingCharacter.characterImages)
            ? existingCharacter.characterImages
            : [],
        }}
        onUpdate={() => {
          // Refresh character data
          fetch('/api/characters/mine')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.characters) {
                setAllCharacters(data.characters)
                const updated = data.characters.find((c: any) => c.id === existingCharacter.id)
                if (updated) setExistingCharacter(updated)
              }
            })
            .catch(() => {})
        }}
        onBack={() => setStep('review')}
      />
    )
  }

  // ============================================
  // CONTENT FACTORY — AI content management
  // ============================================
  if (step === 'content' && existingCharacter) {
    return (
      <ContentFactory
        character={{
          id: existingCharacter.id,
          name: existingCharacter.name || characterName,
          selections: selections,
          customizations: existingCharacter.customizations && typeof existingCharacter.customizations === 'object'
            ? existingCharacter.customizations as Record<string, any>
            : {},
          imageUrls: Array.isArray(existingCharacter.imageUrls) ? existingCharacter.imageUrls : [],
        }}
        onBack={() => setStep('mode')}
      />
    )
  }

  // ============================================
  // REMINDERS — Personality trait reminders
  // ============================================
  if (step === 'reminders' && existingCharacter) {
    return (
      <RemindersPanel
        character={{
          id: existingCharacter.id,
          name: existingCharacter.name || characterName,
          selections: selections,
          customizations: existingCharacter.customizations && typeof existingCharacter.customizations === 'object'
            ? existingCharacter.customizations as Record<string, any>
            : {},
        }}
        onBack={() => setStep('mode')}
      />
    )
  }

  // ============================================
  // BUILD ASSISTANT — System prompt compiler
  // ============================================
  if (step === 'voice' && existingCharacter ) {
    return (
        <TalkingProfileBuilder
          characterId={existingCharacter.id}
          characterName={existingCharacter.name}
          initialProfile={existingCharacter.talkingProfile as any}
          onSave={async (profile) => {
            const res = await fetch('/api/characters/build', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                characterId: existingCharacter.id,
                name: existingCharacter.name,
                selections: existingCharacter.selections,
                customizations: existingCharacter.customizations,
                talkingProfile: profile,
              }),
            })
            if (res.ok) {
              setExistingCharacter((prev: any) => prev ? { ...prev, talkingProfile: profile } : null)
            }
          }}
          onBack={() => setStep('reminders')}
        />
      )
  }

  if (step === 'assistant' && existingCharacter) {
    return (
      <BuildAssistant
        character={{
          id: existingCharacter.id,
          name: existingCharacter.name || characterName,
          selections: selections,
          customizations: existingCharacter.customizations && typeof existingCharacter.customizations === 'object'
            ? existingCharacter.customizations as Record<string, any>
            : {},
          nicheType: nicheType || existingCharacter.nicheType || undefined,
          nicheAudience: nicheAudience || existingCharacter.nicheAudience || undefined,
          missionStatement: missionStatement || existingCharacter.missionStatement || undefined,
          uniqueEdge: uniqueEdge || existingCharacter.uniqueEdge || undefined,
          contentPillars: (existingCharacter.contentPillars as string[]) || undefined,
        }}
        onBack={() => setStep('mode')}
      />
    )
  }

  // Fallback
  return null
}
