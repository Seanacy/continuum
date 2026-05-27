'use client'

import { useState, useEffect, useCallback } from 'react'
import { getBundle } from '@/lib/bundles'

// ============================================
// TYPES
// ============================================
type Mode = 'auto' | 'guided'
type PipelineStep = 'idle' | 'options' | 'profile' | 'saving' | 'content' | 'images' | 'video' | 'done' | 'error'

interface NameOption {
  name: string
  reason: string
}

interface PersonalityOption {
  label: string
  description: string
  templateId?: string
  selections: Record<string, string>
}

interface AppearanceOption {
  label: string
  imagePrompt: string
}

interface GuidedOptions {
  nameOptions: NameOption[]
  personalityOptions: PersonalityOption[]
  appearanceOptions: AppearanceOption[]
}

interface ContentPiece {
  contentType: string
  platform: string
  content: string
  hashtags?: string[]
  needsUserPhoto: boolean
  photoSuggestion?: string
  daySuggestion: string
}

interface ContentPack {
  weekTheme: string
  pieces: ContentPiece[]
  totalPriceCents: number
  charged: boolean
}

interface GeneratedImage {
  url: string
  prompt: string
}

interface CharacterProfile {
  name: string
  selections: Record<string, string>
  nicheType: string
  nicheAudience: string
  missionStatement: string
  uniqueEdge: string
  contentPillars: string[]
  imagePrompt: string
}

// ============================================
// PROPS
// ============================================
type Scope = 'character' | 'full'

interface AiCharacterCreatorProps {
  mode: Mode
  scope: Scope
  specs?: string
  onComplete?: (characterId: string) => void
  onCancel?: () => void
}

// ============================================
// STEP LABELS
// ============================================
const STEP_LABELS: Record<PipelineStep, string> = {
  idle: 'Ready',
  options: 'AI is designing your options...',
  profile: 'AI is crafting your character...',
  saving: 'Saving your character...',
  content: 'Generating your content pack...',
  images: 'Creating character images...',
  video: 'Starting video generation...',
  done: 'All done!',
  error: 'Something went wrong',
}

const STEP_ORDER_FULL: PipelineStep[] = ['profile', 'saving', 'content', 'images', 'video', 'done']
const STEP_ORDER_CHAR: PipelineStep[] = ['profile', 'saving', 'done']
const GUIDED_STEP_ORDER_FULL: PipelineStep[] = ['options', 'profile', 'saving', 'content', 'images', 'video', 'done']
const GUIDED_STEP_ORDER_CHAR: PipelineStep[] = ['options', 'profile', 'saving', 'done']

// ============================================
// MAIN COMPONENT
// ============================================
export default function AiCharacterCreator({ mode, scope, specs, onComplete, onCancel }: AiCharacterCreatorProps) {
  const isCharOnly = scope === 'character'
  // Pipeline state
  const [currentStep, setCurrentStep] = useState<PipelineStep>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // Results collected along the way
  const [profile, setProfile] = useState<CharacterProfile | null>(null)
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [contentPack, setContentPack] = useState<ContentPack | null>(null)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [videoStarted, setVideoStarted] = useState(false)

  // Guided mode state
  const [guidedOptions, setGuidedOptions] = useState<GuidedOptions | null>(null)
  const [selectedName, setSelectedName] = useState<number | null>(null)
  const [selectedPersonality, setSelectedPersonality] = useState<number | null>(null)
  const [selectedAppearance, setSelectedAppearance] = useState<number | null>(null)
  const [guidedStep, setGuidedStep] = useState<'picking' | 'running'>('picking')

  // Delete + Generate Look state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generatingLook, setGeneratingLook] = useState(false)
  const [lookImages, setLookImages] = useState<GeneratedImage[]>([])

  // ============================================
  // API CALL HELPER
  // ============================================
  const callApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/characters/ai-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(data.error || `API error ${res.status}`)
    }
    return res.json()
  }, [])

  // ============================================
  // AUTO MODE â run full pipeline
  // ============================================
  const runAutoPipeline = useCallback(async () => {
    try {
      // Step 1: Generate profile
      setCurrentStep('profile')
      const { profile: gen } = await callApi({ step: 'generate-profile', mode: 'auto', ...(specs ? { specs } : {}) })
      setProfile(gen)

      // Step 2: Save character
      setCurrentStep('saving')
      const { character } = await callApi({ step: 'save-character', profile: gen })
      setCharacterId(character.id)

      // Character-only mode stops here
      if (!isCharOnly) {
        // Step 3: Content pack
        setCurrentStep('content')
        const { contentPack: pack } = await callApi({ step: 'content-pack', characterId: character.id })
        setContentPack(pack)

        // Step 4: Images
        setCurrentStep('images')
        const { images: imgs } = await callApi({
          step: 'generate-images',
          characterId: character.id,
          imagePrompt: gen.imagePrompt,
        })
        setImages(imgs || [])

        // Step 5: Video
        setCurrentStep('video')
        try {
          await callApi({ step: 'start-video', characterId: character.id })
          setVideoStarted(true)
        } catch {
          // Video is optional â don't fail the whole pipeline
          setVideoStarted(false)
        }
      }

      setCurrentStep('done')
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong')
      setCurrentStep('error')
    }
  }, [callApi, isCharOnly])

  // ============================================
  // GUIDED MODE â step 1: get options
  // ============================================
  const fetchGuidedOptions = useCallback(async () => {
    try {
      setCurrentStep('options')
      const { options } = await callApi({ step: 'generate-options' })
      setGuidedOptions(options)
      setCurrentStep('idle')
      setGuidedStep('picking')
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate options')
      setCurrentStep('error')
    }
  }, [callApi])

  // ============================================
  // GUIDED MODE â step 2: run pipeline with picks
  // ============================================
  const runGuidedPipeline = useCallback(async () => {
    if (!guidedOptions || selectedName === null || selectedPersonality === null || selectedAppearance === null) return

    setGuidedStep('running')
    const picked = {
      name: guidedOptions.nameOptions[selectedName].name,
      selections: guidedOptions.personalityOptions[selectedPersonality].selections,
      appearanceDescription: guidedOptions.appearanceOptions[selectedAppearance].label,
    }
    const imagePrompt = guidedOptions.appearanceOptions[selectedAppearance].imagePrompt

    try {
      // Step 1: Generate profile with picks
      setCurrentStep('profile')
      const { profile: gen } = await callApi({
        step: 'generate-profile',
        mode: 'guided',
        answers: picked,
      })
      setProfile(gen)

      // Step 2: Save
      setCurrentStep('saving')
      const { character } = await callApi({ step: 'save-character', profile: gen })
      setCharacterId(character.id)

      // Character-only mode stops here
      if (!isCharOnly) {
        // Step 3: Content
        setCurrentStep('content')
        const { contentPack: pack } = await callApi({ step: 'content-pack', characterId: character.id })
        setContentPack(pack)

        // Step 4: Images
        setCurrentStep('images')
        const { images: imgs } = await callApi({
          step: 'generate-images',
          characterId: character.id,
          imagePrompt: imagePrompt || gen.imagePrompt,
        })
        setImages(imgs || [])

        // Step 5: Video
        setCurrentStep('video')
        try {
          await callApi({ step: 'start-video', characterId: character.id })
          setVideoStarted(true)
        } catch {
          setVideoStarted(false)
        }
      }

      setCurrentStep('done')
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong')
      setCurrentStep('error')
    }
  }, [callApi, isCharOnly, guidedOptions, selectedName, selectedPersonality, selectedAppearance])

  // ============================================
  // DELETE CHARACTER
  // ============================================
  const handleDelete = useCallback(async () => {
    if (!characterId) return
    setDeleting(true)
    try {
      const res = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      onCancel?.()
    } catch (err: any) {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [characterId, onCancel])

  // ============================================
  // GENERATE LOOK
  // ============================================
  const handleGenerateLook = useCallback(async () => {
    if (!characterId || !profile) return
    setGeneratingLook(true)
    try {
      const { images: imgs } = await callApi({
        step: 'generate-images',
        characterId,
        imagePrompt: profile.imagePrompt,
      })
      setLookImages(imgs || [])
      if (imgs?.length) setImages(imgs)
    } catch (err: any) {
      console.error('Generate look error:', err)
    } finally {
      setGeneratingLook(false)
    }
  }, [characterId, profile, callApi])

  // ============================================
  // AUTO-START for auto mode
  // ============================================
  useEffect(() => {
    if (mode === 'auto' && currentStep === 'idle') {
      runAutoPipeline()
    }
    if (mode === 'guided' && currentStep === 'idle' && !guidedOptions) {
      fetchGuidedOptions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ============================================
  // PROGRESS BAR
  // ============================================
  const stepOrder = mode === 'guided'
    ? (isCharOnly ? GUIDED_STEP_ORDER_CHAR : GUIDED_STEP_ORDER_FULL)
    : (isCharOnly ? STEP_ORDER_CHAR : STEP_ORDER_FULL)
  const currentIndex = stepOrder.indexOf(currentStep)
  const progressPercent = currentStep === 'done'
    ? 100
    : currentStep === 'error'
    ? 0
    : currentIndex >= 0
    ? Math.round(((currentIndex + 0.5) / (stepOrder.length - 1)) * 100)
    : 0

  // ============================================
  // RENDER â DONE STATE
  // ============================================
  if (currentStep === 'done') {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-4">&#10024;</div>
          <h2 className="text-3xl font-bold text-white mb-2">Your AI is Ready!</h2>
          <p className="text-continuum-muted mb-8">
            {isCharOnly
              ? `${profile?.name} has been created with a full personality. You can start chatting right away!`
              : `${profile?.name} has been created with a full personality, content pack, and images.${videoStarted ? ' A video is being generated in the background.' : ''}`
            }
          </p>

          {/* Character summary card */}
          <div className="rounded-xl border border-continuum-border bg-continuum-surface p-6 mb-6 text-left">
            <div className="flex items-center gap-4 mb-4">
              {images.length > 0 ? (
                <img
                  src={images[0].url}
                  alt={profile?.name || ''}
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <span className="w-16 h-16 rounded-full bg-continuum-accent/20 flex items-center justify-center text-continuum-accent font-bold text-2xl flex-shrink-0">
                  {profile?.name?.[0] || '?'}
                </span>
              )}
              <div>
                <h3 className="text-xl font-bold text-white">{profile?.name}</h3>
                <p className="text-sm text-continuum-muted">{profile?.nicheType} &middot; {profile?.nicheAudience}</p>
              </div>
            </div>

            {profile?.missionStatement && (
              <p className="text-sm text-continuum-text/80 mb-3 italic">&ldquo;{profile.missionStatement}&rdquo;</p>
            )}

            {/* Trait pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              {profile?.selections && Object.entries(profile.selections).slice(0, 6).map(([cat, bundleId]) => {
                const bundle = getBundle(bundleId)
                return bundle ? (
                  <span
                    key={cat}
                    className="px-2 py-1 rounded-full bg-continuum-accent/10 text-continuum-accent text-xs font-medium"
                  >
                    {bundle.emoji} {bundle.name}
                  </span>
                ) : null
              })}
              {profile?.selections && Object.keys(profile.selections).length > 6 && (
                <span className="px-2 py-1 rounded-full bg-continuum-border text-continuum-muted text-xs">
                  +{Object.keys(profile.selections).length - 6} more
                </span>
              )}
            </div>

            {/* Content pillars */}
            {profile?.contentPillars && profile.contentPillars.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-continuum-muted uppercase tracking-wide">Content Pillars</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {profile.contentPillars.map((p, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-continuum-bg text-continuum-text text-xs">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Images row */}
          {images.length > 0 && (
            <div className="flex gap-4 justify-center mb-6">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={img.url}
                  alt={`Character image ${i + 1}`}
                  className="w-40 h-40 rounded-xl object-cover border border-continuum-border"
                />
              ))}
            </div>
          )}

          {/* Content pack preview */}
          {contentPack && (
            <div className="rounded-xl border border-continuum-border bg-continuum-surface p-5 mb-6 text-left">
              <h4 className="text-sm font-semibold text-white mb-1">Content Pack: {contentPack.weekTheme}</h4>
              <p className="text-xs text-continuum-muted mb-3">{contentPack.pieces.length} pieces ready to post</p>
              <div className="space-y-2">
                {contentPack.pieces.slice(0, 3).map((piece, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs text-continuum-accent font-medium flex-shrink-0 w-16">
                      {piece.daySuggestion}
                    </span>
                    <span className="text-xs text-continuum-muted flex-shrink-0 w-20">
                      {piece.platform}
                    </span>
                    <span className="text-xs text-continuum-text/70 line-clamp-1 flex-1">
                      {piece.content.substring(0, 80)}...
                    </span>
                  </div>
                ))}
                {contentPack.pieces.length > 3 && (
                  <p className="text-xs text-continuum-muted">+{contentPack.pieces.length - 3} more pieces</p>
                )}
              </div>
            </div>
          )}

          {/* Generate Look */}
          {generatingLook ? (
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="w-5 h-5 rounded-full border-2 border-continuum-accent border-t-transparent animate-spin" />
              <span className="text-sm text-continuum-muted">Generating new look...</span>
            </div>
          ) : lookImages.length > 0 ? (
            <div className="mb-4">
              <p className="text-xs text-green-400 text-center mb-2">New look generated!</p>
            </div>
          ) : null}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-4">
              <p className="text-sm text-white mb-3">Are you sure you want to delete {profile?.name}? This can&apos;t be undone.</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-continuum-border text-continuum-muted text-sm hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => onComplete?.(characterId || '')}
              className="px-6 py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent/90 text-white font-semibold transition"
            >
              Start Chatting with {profile?.name}
            </button>
            <button
              onClick={handleGenerateLook}
              disabled={generatingLook}
              className="px-6 py-3 rounded-xl border border-continuum-accent text-continuum-accent hover:bg-continuum-accent/10 font-semibold transition disabled:opacity-50"
            >
              {generatingLook ? 'Generating...' : 'Generate Look'}
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-3 rounded-xl border border-continuum-border text-continuum-muted hover:text-white transition"
            >
              Back to Characters
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-6 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
            >
              Delete Character
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER â ERROR STATE
  // ============================================
  if (currentStep === 'error') {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">&#9888;&#65039;</div>
          <h2 className="text-2xl font-bold text-white mb-2">Something Went Wrong</h2>
          <p className="text-sm text-continuum-muted mb-6">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setCurrentStep('idle')
                setErrorMessage('')
                if (mode === 'auto') runAutoPipeline()
                else if (guidedStep === 'running') runGuidedPipeline()
                else fetchGuidedOptions()
              }}
              className="px-5 py-2.5 rounded-xl bg-continuum-accent hover:bg-continuum-accent/90 text-white font-semibold transition"
            >
              Try Again
            </button>
            <button
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-continuum-border text-continuum-muted hover:text-white transition"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER â GUIDED MODE: PICKING OPTIONS
  // ============================================
  if (mode === 'guided' && guidedOptions && guidedStep === 'picking') {
    const allPicked = selectedName !== null && selectedPersonality !== null && selectedAppearance !== null

    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-3xl mx-auto">
          <button onClick={onCancel} className="text-sm text-continuum-muted mb-6 hover:text-white transition">
            &larr; Back
          </button>

          <h2 className="text-3xl font-bold text-white text-center mb-2">Design Your AI</h2>
          <p className="text-sm text-continuum-muted text-center mb-8">
            AI picked these options based on your brand. Tap to choose.
          </p>

          {/* NAME OPTIONS */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-3">1. Pick a Name</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {guidedOptions.nameOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedName(i)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedName === i
                      ? 'border-continuum-accent bg-continuum-accent/10'
                      : 'border-continuum-border bg-continuum-surface hover:border-continuum-accent/30'
                  }`}
                >
                  <span className="text-lg font-bold text-white block mb-1">{opt.name}</span>
                  <span className="text-xs text-continuum-muted">{opt.reason}</span>
                </button>
              ))}
            </div>
          </div>

          {/* PERSONALITY OPTIONS */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-3">2. Pick a Personality</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {guidedOptions.personalityOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPersonality(i)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedPersonality === i
                      ? 'border-continuum-accent bg-continuum-accent/10'
                      : 'border-continuum-border bg-continuum-surface hover:border-continuum-accent/30'
                  }`}
                >
                  <span className="text-base font-bold text-white block mb-1">{opt.label}</span>
                  <span className="text-xs text-continuum-muted block mb-2">{opt.description}</span>
                  {/* Show a few trait pills */}
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(opt.selections).slice(0, 3).map(([cat, bundleId]) => {
                      const bundle = getBundle(bundleId)
                      return bundle ? (
                        <span key={cat} className="px-1.5 py-0.5 rounded bg-continuum-bg text-continuum-accent text-[10px]">
                          {bundle.emoji} {bundle.name}
                        </span>
                      ) : null
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* APPEARANCE OPTIONS */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-3">3. Pick a Look</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {guidedOptions.appearanceOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAppearance(i)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedAppearance === i
                      ? 'border-continuum-accent bg-continuum-accent/10'
                      : 'border-continuum-border bg-continuum-surface hover:border-continuum-accent/30'
                  }`}
                >
                  <span className="text-2xl mb-2 block">&#127912;</span>
                  <span className="text-sm font-semibold text-white block mb-1">{opt.label}</span>
                  <span className="text-xs text-continuum-muted line-clamp-2">{opt.imagePrompt.substring(0, 80)}...</span>
                </button>
              ))}
            </div>
          </div>

          {/* GO BUTTON */}
          <div className="text-center">
            <button
              onClick={runGuidedPipeline}
              disabled={!allPicked}
              className={`px-8 py-3 rounded-xl font-semibold text-lg transition ${
                allPicked
                  ? 'bg-continuum-accent hover:bg-continuum-accent/90 text-white'
                  : 'bg-continuum-border text-continuum-muted cursor-not-allowed'
              }`}
            >
              {allPicked ? 'Create My AI Character' : 'Pick all 3 options above'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER â PIPELINE RUNNING (auto or guided-running)
  // ============================================
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center">
        {/* Cancel */}
        {currentStep !== 'idle' && (
          <button onClick={onCancel} className="text-sm text-continuum-muted mb-8 hover:text-white transition block mx-auto">
            &larr; Cancel
          </button>
        )}

        {/* Big icon */}
        <div className="text-6xl mb-6 animate-pulse">
          {currentStep === 'profile' && '\u{1F9E0}'}
          {currentStep === 'saving' && '\u{1F4BE}'}
          {currentStep === 'content' && '\u{270D}\u{FE0F}'}
          {currentStep === 'images' && '\u{1F3A8}'}
          {currentStep === 'video' && '\u{1F3AC}'}
          {currentStep === 'options' && '\u{2728}'}
          {currentStep === 'idle' && '\u{1F680}'}
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">
          {isCharOnly
            ? 'Creating Your Character'
            : mode === 'auto' ? 'AI Is Building Everything' : 'Building Your Character'}
        </h2>
        <p className="text-continuum-muted mb-8">{STEP_LABELS[currentStep]}</p>

        {/* Progress bar */}
        <div className="w-full bg-continuum-border rounded-full h-2.5 mb-4">
          <div
            className="h-2.5 rounded-full bg-continuum-accent transition-all duration-700"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step checklist */}
        <div className="space-y-2 text-left max-w-xs mx-auto">
          {stepOrder.filter(s => s !== 'done').map((s) => {
            const idx = stepOrder.indexOf(s)
            const curIdx = stepOrder.indexOf(currentStep)
            const isDone = curIdx > idx
            const isActive = s === currentStep
            return (
              <div key={s} className="flex items-center gap-3">
                {isDone ? (
                  <span className="text-green-400 text-sm">&#10003;</span>
                ) : isActive ? (
                  <span className="w-4 h-4 rounded-full border-2 border-continuum-accent animate-pulse" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-continuum-border" />
                )}
                <span className={`text-sm ${isDone ? 'text-green-400' : isActive ? 'text-white' : 'text-continuum-muted'}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Show partial results as they come in */}
        {profile && (
          <div className="mt-6 rounded-xl border border-continuum-border bg-continuum-surface p-4 text-left">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-continuum-accent/20 flex items-center justify-center text-continuum-accent font-bold text-lg">
                {profile.name?.[0] || '?'}
              </span>
              <div>
                <span className="text-white font-semibold block">{profile.name}</span>
                <span className="text-xs text-continuum-muted">{profile.nicheType}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
