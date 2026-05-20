'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BUNDLES,
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

// ============================================
// TYPES
// ============================================
type BuildMode = 'pick' | 'instant' | 'custom'
type Step = 'mode' | 'template' | 'category' | 'review'

interface Selections {
  [categoryKey: string]: string // categoryKey -> bundleId
}

interface Customizations {
  [key: string]: string // e.g. "identity_custom" -> custom text
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function CharacterBuilder() {
  const [step, setStep] = useState<Step>('mode')
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
  const [loadingCharacter, setLoadingCharacter] = useState(true)

  // Load existing character on mount
  useEffect(() => {
    fetch('/api/characters/mine')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.character) {
          const c = data.character
          setExistingCharacter(c)
          setCharacterName(c.name || '')
          setSelections(c.selections && typeof c.selections === 'object' ? c.selections : {})
          setCustomizations(c.customizations && typeof c.customizations === 'object' ? c.customizations : {})
          setNicheType(c.nicheType || '')
          setNicheAudience(c.nicheAudience || '')
          setMissionStatement(c.missionStatement || '')
          setUniqueEdge(c.uniqueEdge || '')
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCharacter(false))
  }, [])

  // Derived
  const currentCategory = CATEGORIES[currentCategoryIndex]
  const categoryBundles = currentCategory ? (BUNDLES[currentCategory.key] || []) : []
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
  // MODE PICKER — first screen
  // ============================================
  if (step === 'mode') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-bold text-white mb-1">
            {existingCharacter ? `Edit ${existingCharacter.name}` : 'Build Your Character'}
          </h2>
          <p className="text-sm text-continuum-muted mb-6">
            {existingCharacter
              ? 'Update your character\'s personality, style, and traits.'
              : 'Choose how you want to create your AI character.'}
          </p>

          {/* Instant — Template */}
          <button
            onClick={() => { setBuildMode('instant'); setStep('template') }}
            className="w-full text-left p-4 mb-3 rounded-xl border border-continuum-border bg-continuum-surface hover:border-continuum-accent/50 transition-all"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">⚡</span>
              <span className="text-base font-semibold text-white">Instant Build</span>
              <span className="text-xs text-continuum-muted ml-auto">~2 min</span>
            </div>
            <p className="text-sm text-continuum-muted ml-11">
              Pick a pre-built template and start creating content immediately.
            </p>
          </button>

          {/* Custom — Step by step */}
          <button
            onClick={() => { setBuildMode('custom'); setCurrentCategoryIndex(0); setStep('category') }}
            className="w-full text-left p-4 mb-3 rounded-xl border border-continuum-border bg-continuum-surface hover:border-purple-500/50 transition-all"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🎨</span>
              <span className="text-base font-semibold text-white">Custom Build</span>
              <span className="text-xs text-continuum-muted ml-auto">~15 min</span>
            </div>
            <p className="text-sm text-continuum-muted ml-11">
              Go category by category — pick traits, voice, niche, goals, and more.
            </p>
          </button>

          {/* If existing character, show quick edit */}
          {existingCharacter && Object.keys(existingCharacter.selections || {}).length > 0 && (
            <button
              onClick={() => setStep('review')}
              className="w-full text-left p-4 mb-3 rounded-xl border border-continuum-border bg-continuum-surface hover:border-green-500/50 transition-all"
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">✏️</span>
                <span className="text-base font-semibold text-white">Quick Edit</span>
              </div>
              <p className="text-sm text-continuum-muted ml-11">
                Jump straight to your current build and tweak specific things.
              </p>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // TEMPLATE PICKER — Instant Build
  // ============================================
  if (step === 'template') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setStep('mode')} className="text-sm text-continuum-muted mb-4 hover:text-white transition">
            ← Back
          </button>
          <h2 className="text-xl font-bold text-white mb-1">Pick a Template</h2>
          <p className="text-sm text-continuum-muted mb-5">
            Each template comes with a full personality pre-built. You can customize it later.
          </p>

          <div className="space-y-3">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="w-full text-left p-4 rounded-xl border border-continuum-border bg-continuum-surface hover:border-continuum-accent/50 transition-all"
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-2xl">{t.emoji}</span>
                  <span className="text-base font-semibold text-white">{t.name}</span>
                </div>
                <p className="text-sm text-continuum-muted ml-11">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // CATEGORY BUILDER — Custom Build, step by step
  // ============================================
  if (step === 'category' && currentCategory) {
    const selectedBundleId = selections[currentCategory.key]
    const customText = customizations[`${currentCategory.key}_custom`] || ''

    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-lg mx-auto">
          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevCategory} className="text-sm text-continuum-muted hover:text-white transition">
              ← {currentCategoryIndex === 0 ? 'Back' : CATEGORIES[currentCategoryIndex - 1]?.label}
            </button>
            <span className="text-xs text-continuum-muted">
              {currentCategoryIndex + 1} / {totalCategories}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-continuum-border rounded-full mb-5">
            <div
              className="h-1 bg-continuum-accent rounded-full transition-all duration-300"
              style={{ width: `${((currentCategoryIndex + 1) / totalCategories) * 100}%` }}
            />
          </div>

          <h2 className="text-lg font-bold text-white mb-1">{currentCategory.icon} {currentCategory.label}</h2>
          <p className="text-sm text-continuum-muted mb-4">Pick the option that fits your character best.</p>

          {/* Search */}
          <div className="relative mb-4">
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

          {/* Bundle options */}
          <div className="space-y-2 mb-4">
            {(searchQuery.length >= 2
              ? searchResults.filter(r => r.category === currentCategory.key)
              : categoryBundles
            ).map(bundle => (
              <button
                key={bundle.id}
                onClick={() => selectBundle(currentCategory.key, bundle.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedBundleId === bundle.id
                    ? 'border-continuum-accent bg-continuum-accent/10'
                    : 'border-continuum-border bg-continuum-surface hover:border-continuum-accent/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${selectedBundleId === bundle.id ? 'text-continuum-accent' : 'text-white'}`}>
                    {bundle.emoji} {bundle.name}
                  </span>
                  {selectedBundleId === bundle.id && (
                    <span className="text-continuum-accent text-xs">✓</span>
                  )}
                </div>
                <p className="text-xs text-continuum-muted mt-0.5">{bundle.desc}</p>
                {bundle.tag && (
                  <div className="mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-continuum-bg text-continuum-muted">
                      {bundle.tag}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Custom text override */}
          <div className="mb-5">
            <label className="text-xs text-continuum-muted block mb-1">
              Or write your own (optional):
            </label>
            <textarea
              value={customText}
              onChange={e => setCustomText(currentCategory.key, e.target.value)}
              placeholder={`Describe your character's ${currentCategory.label.toLowerCase()} in your own words...`}
              rows={3}
              className="w-full px-3 py-2 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none"
            />
          </div>

          {/* Next / Skip */}
          <div className="flex gap-3">
            <button
              onClick={nextCategory}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white transition"
            >
              Skip
            </button>
            <button
              onClick={nextCategory}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                selectedBundleId || customText
                  ? 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
                  : 'bg-continuum-surface text-continuum-muted'
              }`}
            >
              {currentCategoryIndex === totalCategories - 1 ? 'Review Build' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // REVIEW — Final summary + save
  // ============================================
  if (step === 'review') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => {
              if (buildMode === 'custom') {
                setStep('category')
              } else {
                setStep('mode')
              }
            }}
            className="text-sm text-continuum-muted mb-4 hover:text-white transition"
          >
            ← Back
          </button>

          <h2 className="text-xl font-bold text-white mb-1">Review Your Character</h2>
          <p className="text-sm text-continuum-muted mb-5">
            {selectionCount} of {totalCategories} categories filled. You can always come back and edit.
          </p>

          {/* Character name */}
          <div className="mb-5">
            <label className="text-xs font-medium text-continuum-muted block mb-1">Character Name *</label>
            <input
              type="text"
              value={characterName}
              onChange={e => setCharacterName(e.target.value)}
              placeholder="What's your character's name?"
              className="w-full px-4 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
            />
          </div>

          {/* Bundle selections summary */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-white mb-2">Personality Build</h3>
            <div className="space-y-2">
              {CATEGORIES.map(cat => {
                const bundleId = selections[cat.key]
                const bundle = bundleId ? getBundle(cat.key, bundleId) : null
                const custom = customizations[`${cat.key}_custom`]
                const hasValue = bundle || custom

                return (
                  <div
                    key={cat.key}
                    onClick={() => {
                      const idx = CATEGORIES.findIndex(c => c.key === cat.key)
                      setCurrentCategoryIndex(idx)
                      setBuildMode('custom')
                      setStep('category')
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      hasValue
                        ? 'border-continuum-accent/30 bg-continuum-accent/5'
                        : 'border-continuum-border bg-continuum-surface hover:border-continuum-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">
                        {cat.icon} {cat.label}
                      </span>
                      {hasValue ? (
                        <span className="text-xs text-continuum-accent">✓ Set</span>
                      ) : (
                        <span className="text-xs text-continuum-muted">Tap to add</span>
                      )}
                    </div>
                    {bundle && (
                      <p className="text-xs text-continuum-muted mt-0.5">{bundle.emoji} {bundle.name}</p>
                    )}
                    {custom && !bundle && (
                      <p className="text-xs text-continuum-muted mt-0.5 truncate">&quot;{custom}&quot;</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Niche details */}
          <div className="mb-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Niche Details</h3>
            <div>
              <label className="text-xs text-continuum-muted block mb-1">Niche / Industry</label>
              <input
                type="text"
                value={nicheType}
                onChange={e => setNicheType(e.target.value)}
                placeholder="e.g. Fitness, Beauty, Tech, Finance..."
                className="w-full px-3 py-2 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-continuum-muted block mb-1">Target Audience</label>
              <input
                type="text"
                value={nicheAudience}
                onChange={e => setNicheAudience(e.target.value)}
                placeholder="Who is your character speaking to?"
                className="w-full px-3 py-2 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-continuum-muted block mb-1">Mission Statement</label>
              <textarea
                value={missionStatement}
                onChange={e => setMissionStatement(e.target.value)}
                placeholder="What is your character's purpose? Why do they exist?"
                rows={2}
                className="w-full px-3 py-2 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-continuum-muted block mb-1">Unique Edge</label>
              <input
                type="text"
                value={uniqueEdge}
                onChange={e => setUniqueEdge(e.target.value)}
                placeholder="What makes this character stand out from everyone else?"
                className="w-full px-3 py-2 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Content pillars */}
          {contentPillars.length > 0 && (
            <div className="mb-5">
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
              <p className="text-xs text-continuum-muted mt-1">
                Auto-generated based on your niche and personality picks.
              </p>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={saveCharacter}
            disabled={saving || !characterName.trim()}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
              saving
                ? 'bg-continuum-surface text-continuum-muted cursor-wait'
                : saved
                  ? 'bg-green-600 text-white'
                  : !characterName.trim()
                    ? 'bg-continuum-surface text-continuum-muted cursor-not-allowed'
                    : 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
            }`}
          >
            {saving ? 'Saving...' : saved ? '✓ Character Saved!' : existingCharacter ? 'Update Character' : 'Save Character'}
          </button>

          {saved && (
            <p className="text-center text-xs text-green-400 mt-2">
              Your character is live! Chat with them now in the Chat tab.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Fallback
  return null
}
