'use client'

import { useState, useRef } from 'react'
import {
  TRAIT_CATEGORIES,
  countFilledTraits,
  type VisualTraits,
  type TraitCategory,
} from '@/lib/visual-traits'
import {
  generatePrompts,
  IMAGE_TYPES,
  IMAGE_TYPE_LABELS,
  type ImageType,
  type GeneratedPrompts,
} from '@/lib/visual-prompt-generator'

// ============================================
// TYPES
// ============================================
type VisualStep = 'description' | 'traits' | 'prompts' | 'reference-approval' | 'generation' | 'complete'

interface CharacterData {
  id: string
  name: string
  selections: Record<string, string>
  customizations: Record<string, any>
  nicheType?: string
  visualTraits?: VisualTraits
  characterImages?: Array<{ imageType: string; imageUrl: string }>
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function VisualCreator({
  character,
  onUpdate,
  onBack,
}: {
  character: CharacterData
  onUpdate?: () => void
  onBack?: () => void
}) {
  // State
  const [currentStep, setCurrentStep] = useState<VisualStep>('description')
  const [traits, setTraits] = useState<VisualTraits>(character.visualTraits || {})
  const [description, setDescription] = useState(character.visualTraits?.description || '')
  const [saving, setSaving] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadedImages, setUploadedImages] = useState<Record<string, string>>(() => {
    const existing: Record<string, string> = {}
    if (character.characterImages) {
      for (const img of character.characterImages) {
        existing[img.imageType] = img.imageUrl
      }
    }
    return existing
  })
  const [error, setError] = useState<string | null>(null)
  const [approvalEnabled, setApprovalEnabled] = useState(false)
  const [currentGenStep, setCurrentGenStep] = useState(0) // 0-5 for generation progress

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Derived
  const filledTraits = countFilledTraits(traits)
  const totalTraits = TRAIT_CATEGORIES.length
  const uploadedCount = Object.keys(uploadedImages).length
  const prompts = generatePrompts(traits, character.name, character.nicheType)

  // ============================================
  // HANDLERS
  // ============================================
  function updateTrait(key: keyof VisualTraits, value: string) {
    setTraits(prev => ({ ...prev, [key]: value }))
  }

  async function saveTraits() {
    setSaving(true)
    try {
      const updatedTraits = { ...traits, description }
      await fetch('/api/characters/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          name: character.name,
          selections: character.selections,
          customizations: character.customizations,
          visualTraits: updatedTraits,
        }),
      })
      if (onUpdate) onUpdate()
    } catch (err) {
      console.error('Failed to save traits:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopiedPrompt(label)
    setTimeout(() => setCopiedPrompt(null), 2000)
  }

  async function handleUpload(imageType: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WEBP)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB')
      return
    }

    setError(null)
    setUploading(imageType)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('characterId', character.id)
      formData.append('imageType', imageType)

      const res = await fetch('/api/characters/visual-images', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      setUploadedImages(prev => ({ ...prev, [imageType]: data.url }))
      if (onUpdate) onUpdate()
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(null)
      if (fileInputRefs.current[imageType]) {
        fileInputRefs.current[imageType]!.value = ''
      }
    }
  }

  function triggerUpload(imageType: string) {
    fileInputRefs.current[imageType]?.click()
  }

  // ============================================
  // STEP 1: DESCRIPTION
  // ============================================
  function renderDescription() {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">Describe Your Character</h3>
          <p className="text-sm text-continuum-muted mb-4">
            Write a quick description of what {character.name} looks like. This is optional — you can also just pick traits in the next step.
          </p>
          <textarea
            id="visual-description"
            name="visual-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={`Example: A confident woman in her late 20s with warm brown skin, long curly black hair, and bright hazel eyes. She has an athletic build and loves wearing bold streetwear.`}
            rows={4}
            className="w-full px-4 py-3 bg-continuum-bg border border-continuum-border rounded-xl text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none"
          />
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => {
              setCurrentStep('traits')
            }}
            className="px-4 py-2 text-sm text-continuum-muted hover:text-white transition"
          >
            Skip →
          </button>
          <button
            type="button"
            onClick={() => {
              setTraits(prev => ({ ...prev, description }))
              setCurrentStep('traits')
            }}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition"
          >
            Next: Pick Traits →
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 2: TRAITS — standard <select> elements
  // ============================================
  function renderTraits() {
    const faceTraits = TRAIT_CATEGORIES.filter(c => c.group === 'face')
    const bodyTraits = TRAIT_CATEGORIES.filter(c => c.group === 'body')

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">Pick Visual Traits</h3>
          <p className="text-sm text-continuum-muted mb-1">
            {filledTraits} of {totalTraits} traits selected
          </p>
          <div className="w-full h-1.5 bg-continuum-border rounded-full mb-6">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${(filledTraits / totalTraits) * 100}%`,
                background: filledTraits === totalTraits
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
              }}
            />
          </div>
        </div>

        {/* Face Traits */}
        <div>
          <h4 className="text-sm font-bold text-continuum-accent mb-3 uppercase tracking-wide">Face</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {faceTraits.map(cat => (
              <TraitSelect
                key={cat.key}
                category={cat}
                value={traits[cat.key] || ''}
                onChange={(val) => updateTrait(cat.key, val)}
              />
            ))}
          </div>
        </div>

        {/* Body Traits */}
        <div>
          <h4 className="text-sm font-bold text-continuum-accent mb-3 uppercase tracking-wide">Body</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bodyTraits.map(cat => (
              <TraitSelect
                key={cat.key}
                category={cat}
                value={traits[cat.key] || ''}
                onChange={(val) => updateTrait(cat.key, val)}
              />
            ))}
          </div>
        </div>

        {/* Reference Approval Toggle */}
        <div className="rounded-xl border border-continuum-border bg-continuum-surface p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="approval-toggle"
              name="approval-toggle"
              checked={approvalEnabled}
              onChange={e => setApprovalEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-continuum-border bg-continuum-bg text-continuum-accent focus:ring-continuum-accent"
            />
            <div>
              <span className="text-sm font-semibold text-white">Enable Reference Photo Approval</span>
              <p className="text-xs text-continuum-muted mt-0.5">
                When your AI agent finds reference photos, they&apos;ll show up on screen for you to approve or reject before generating.
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setCurrentStep('description')}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white transition"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={async () => {
              await saveTraits()
              setCurrentStep('prompts')
            }}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Next: View Prompts →'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 3: PROMPTS — show all generated prompts
  // ============================================
  function renderPrompts() {
    const promptList: { key: string; label: string; text: string; step: number }[] = [
      { key: 'googleFaceQuery', label: 'Google Face Search', text: prompts.googleFaceQuery, step: 0 },
      { key: 'googleBodyQuery', label: 'Google Body Search', text: prompts.googleBodyQuery, step: 0 },
      { key: 'geminiHeadFront', label: 'Step 1: Head — Front (The Blend)', text: prompts.geminiHeadFront, step: 1 },
      { key: 'geminiHeadLeft', label: 'Step 2: Head — Left Profile', text: prompts.geminiHeadLeft, step: 2 },
      { key: 'geminiHeadRight', label: 'Step 3: Head — Right Profile', text: prompts.geminiHeadRight, step: 3 },
      { key: 'geminiBodyFront', label: 'Step 4: Body — Front', text: prompts.geminiBodyFront, step: 4 },
      { key: 'geminiBodyLeft', label: 'Step 5: Body — Left Profile', text: prompts.geminiBodyLeft, step: 5 },
      { key: 'geminiBodyRight', label: 'Step 6: Body — Right Profile', text: prompts.geminiBodyRight, step: 6 },
    ]

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">Generated Prompts</h3>
          <p className="text-sm text-continuum-muted mb-4">
            These are the search queries and AI prompts built from {character.name}&apos;s traits.
            {approvalEnabled ? ' Reference photos will need your approval before generation.' : ''}
          </p>
        </div>

        {/* Google Search Queries */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
          <h4 className="text-sm font-bold text-blue-300 mb-3">Google Image Search Queries</h4>
          <p className="text-xs text-continuum-muted mb-3">
            Your AI agent will search Google Images using these queries to find reference photos for blending.
          </p>
          {promptList.filter(p => p.key.startsWith('google')).map(p => (
            <div key={p.key} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-blue-200">{p.label}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(p.text, p.key)}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                    copiedPrompt === p.key
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
                  }`}
                >
                  {copiedPrompt === p.key ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-continuum-bg border border-continuum-border text-xs text-continuum-text font-mono">
                {p.text}
              </div>
            </div>
          ))}
        </div>

        {/* Gemini Generation Prompts */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-purple-300">Gemini Image Generation Prompts</h4>
          <p className="text-xs text-continuum-muted mb-2">
            These prompts are used one at a time, in order. Each one builds on the image created by the previous prompt. Stay in the same Gemini conversation.
          </p>
          {promptList.filter(p => p.key.startsWith('gemini')).map(p => (
            <PromptCard
              key={p.key}
              label={p.label}
              text={p.text}
              promptKey={p.key}
              copied={copiedPrompt === p.key}
              onCopy={() => handleCopy(p.text, p.key)}
            />
          ))}
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setCurrentStep('traits')}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white transition"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(approvalEnabled ? 'reference-approval' : 'generation')}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition"
          >
            {approvalEnabled ? 'Next: Reference Approval →' : 'Next: Upload Images →'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 4 (optional): REFERENCE APPROVAL
  // ============================================
  function renderReferenceApproval() {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">Reference Photo Approval</h3>
          <p className="text-sm text-continuum-muted mb-4">
            Your AI agent will find reference photos and display them here. You can approve them or ask for different ones.
          </p>
        </div>

        {/* Face Reference */}
        <div className="rounded-xl border border-continuum-border bg-continuum-surface p-5">
          <h4 className="text-sm font-bold text-white mb-3">Face References</h4>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="aspect-square rounded-lg border-2 border-dashed border-continuum-border bg-continuum-bg flex items-center justify-center">
                <span className="text-xs text-continuum-muted text-center px-2">
                  Reference {i}<br />
                  <span className="text-[10px]">(AI agent will place image here)</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              id="approve-face-refs"
              name="approve-face-refs"
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition"
            >
              Approve
            </button>
            <button
              type="button"
              id="reject-face-refs"
              name="reject-face-refs"
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition"
            >
              Find Others
            </button>
          </div>
        </div>

        {/* Body Reference */}
        <div className="rounded-xl border border-continuum-border bg-continuum-surface p-5">
          <h4 className="text-sm font-bold text-white mb-3">Body References</h4>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="aspect-[3/4] rounded-lg border-2 border-dashed border-continuum-border bg-continuum-bg flex items-center justify-center">
                <span className="text-xs text-continuum-muted text-center px-2">
                  Reference {i}<br />
                  <span className="text-[10px]">(AI agent will place image here)</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              id="approve-body-refs"
              name="approve-body-refs"
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition"
            >
              Approve
            </button>
            <button
              type="button"
              id="reject-body-refs"
              name="reject-body-refs"
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition"
            >
              Find Others
            </button>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setCurrentStep('prompts')}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white transition"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep('generation')}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition"
          >
            Next: Generate Images →
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 5: GENERATION — upload slots + progress
  // ============================================
  function renderGeneration() {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">Generate & Upload Images</h3>
          <p className="text-sm text-continuum-muted mb-1">
            {uploadedCount} of 6 images uploaded
          </p>
          <div className="w-full h-1.5 bg-continuum-border rounded-full mb-4">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${(uploadedCount / 6) * 100}%`,
                background: uploadedCount === 6
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
              }}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Step-by-step generation cards */}
        <div className="space-y-3">
          {IMAGE_TYPES.map((imageType, idx) => {
            const label = IMAGE_TYPE_LABELS[imageType]
            const hasImage = !!uploadedImages[imageType]
            const isUploading = uploading === imageType
            const promptKey = [
              'geminiHeadFront', 'geminiHeadLeft', 'geminiHeadRight',
              'geminiBodyFront', 'geminiBodyLeft', 'geminiBodyRight',
            ][idx] as keyof GeneratedPrompts
            const promptText = prompts[promptKey]

            return (
              <div
                key={imageType}
                className={`rounded-xl border overflow-hidden transition-all ${
                  hasImage
                    ? 'border-green-500/40 bg-green-500/5'
                    : 'border-continuum-border bg-continuum-surface'
                }`}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Step number / check */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                    hasImage
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-continuum-bg text-continuum-muted'
                  }`}>
                    {hasImage ? '✓' : idx + 1}
                  </div>

                  {/* Image preview or placeholder */}
                  <div
                    onClick={() => triggerUpload(imageType)}
                    className={`w-16 h-20 rounded-lg overflow-hidden cursor-pointer flex-shrink-0 border transition ${
                      hasImage
                        ? 'border-green-500/30'
                        : 'border-dashed border-continuum-border hover:border-continuum-accent/50'
                    }`}
                  >
                    {hasImage ? (
                      <img src={uploadedImages[imageType]} alt={label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-continuum-bg">
                        {isUploading ? (
                          <div className="w-4 h-4 border-2 border-continuum-accent border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="text-xs text-continuum-muted">+</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Label and actions */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-continuum-muted mt-0.5">
                      {hasImage ? 'Uploaded' : idx === 0 ? 'Upload reference photos + paste prompt in Gemini' : 'Paste prompt in same Gemini conversation'}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(promptText, imageType)}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        copiedPrompt === imageType
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-continuum-accent/15 text-continuum-accent hover:bg-continuum-accent/25'
                      }`}
                    >
                      {copiedPrompt === imageType ? '✓' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      id={`upload-${imageType}`}
                      name={`upload-${imageType}`}
                      onClick={() => triggerUpload(imageType)}
                      className="px-2 py-1 rounded text-xs font-medium bg-continuum-surface text-continuum-muted border border-continuum-border hover:text-white transition"
                    >
                      Upload
                    </button>
                  </div>

                  {/* Hidden file input */}
                  <input
                    type="file"
                    accept="image/*"
                    id={`file-${imageType}`}
                    name={`file-${imageType}`}
                    className="hidden"
                    ref={el => { fileInputRefs.current[imageType] = el }}
                    onChange={(e) => handleUpload(imageType, e)}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setCurrentStep(approvalEnabled ? 'reference-approval' : 'prompts')}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white transition"
          >
            ← Back
          </button>
          {uploadedCount === 6 && (
            <button
              type="button"
              onClick={() => setCurrentStep('complete')}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-500 transition"
            >
              Complete! →
            </button>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 6: COMPLETE
  // ============================================
  function renderComplete() {
    return (
      <div className="space-y-6 text-center">
        <div className="py-6">
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-white mb-2">
            {character.name}&apos;s Look is Complete!
          </h3>
          <p className="text-sm text-continuum-muted max-w-md mx-auto">
            All 6 profile images are uploaded. These will be used to generate on-brand content.
          </p>
        </div>

        {/* Preview grid */}
        <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
          {IMAGE_TYPES.map(imageType => (
            <div key={imageType} className="text-center">
              <div className="aspect-[3/4] rounded-xl overflow-hidden border border-green-500/30">
                {uploadedImages[imageType] ? (
                  <img src={uploadedImages[imageType]} alt={IMAGE_TYPE_LABELS[imageType]} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-continuum-bg flex items-center justify-center">
                    <span className="text-xs text-continuum-muted">—</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-continuum-muted mt-1">{IMAGE_TYPE_LABELS[imageType]}</p>
            </div>
          ))}
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={onBack}
            className="px-8 py-3 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition"
          >
            ← Back to Character
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP INDICATOR
  // ============================================
  const steps: { key: VisualStep; label: string }[] = [
    { key: 'description', label: 'Describe' },
    { key: 'traits', label: 'Traits' },
    { key: 'prompts', label: 'Prompts' },
    ...(approvalEnabled ? [{ key: 'reference-approval' as VisualStep, label: 'Approve' }] : []),
    { key: 'generation', label: 'Generate' },
    { key: 'complete', label: 'Done' },
  ]

  const currentStepIndex = steps.findIndex(s => s.key === currentStep)

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <div className="h-full overflow-y-auto p-4 pb-8">
      <div className="max-w-lg mx-auto">
        {/* Back to Character */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-continuum-muted mb-4 hover:text-white transition"
          >
            ← Back to Character
          </button>
        )}

        {/* Header */}
        <h2 className="text-xl font-bold text-white mb-1">
          Create {character.name}&apos;s Look
        </h2>
        <p className="text-sm text-continuum-muted mb-5">
          Build a consistent visual identity using AI image generation.
        </p>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-6">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1">
              <div className={`flex-1 h-1 rounded-full transition-all ${
                i <= currentStepIndex ? 'bg-continuum-accent' : 'bg-continuum-border'
              }`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mb-6">
          {steps.map((s, i) => (
            <span key={s.key} className={`text-[10px] font-medium ${
              i <= currentStepIndex ? 'text-continuum-accent' : 'text-continuum-muted'
            }`}>
              {s.label}
            </span>
          ))}
        </div>

        {/* Render current step */}
        {currentStep === 'description' && renderDescription()}
        {currentStep === 'traits' && renderTraits()}
        {currentStep === 'prompts' && renderPrompts()}
        {currentStep === 'reference-approval' && renderReferenceApproval()}
        {currentStep === 'generation' && renderGeneration()}
        {currentStep === 'complete' && renderComplete()}
      </div>
    </div>
  )
}

// ============================================
// TRAIT SELECT — standard <select> for AI agent
// ============================================
function TraitSelect({
  category,
  value,
  onChange,
}: {
  category: TraitCategory
  value: string
  onChange: (val: string) => void
}) {
  return (
    <div>
      <label
        htmlFor={`trait-${category.key}`}
        className="text-xs text-continuum-muted block mb-1"
      >
        {category.label}
      </label>
      <select
        id={`trait-${category.key}`}
        name={`trait-${category.key}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-continuum-bg border border-continuum-border rounded-lg text-sm text-white focus:border-continuum-accent focus:outline-none appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M6 8L1 3h10z' fill='%236b7280'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
        }}
      >
        <option value="">— Select —</option>
        {category.options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

// ============================================
// PROMPT CARD — expandable prompt display
// ============================================
function PromptCard({
  label,
  text,
  promptKey,
  copied,
  onCopy,
}: {
  label: string
  text: string
  promptKey: string
  copied: boolean
  onCopy: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-continuum-border bg-continuum-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-continuum-bg/50 transition"
      >
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-continuum-muted text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-continuum-border">
          <div className="mt-3 p-3 rounded-lg bg-continuum-bg border border-continuum-border font-mono text-[11px] leading-relaxed text-continuum-text max-h-40 overflow-y-auto whitespace-pre-wrap">
            {text}
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              copied
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy Prompt'}
          </button>
        </div>
      )}
    </div>
  )
}
