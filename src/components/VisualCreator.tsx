'use client'

import { useState, useRef } from 'react'
import { BUNDLES } from '@/lib/bundles'

// ============================================
// TYPES
// ============================================
type SlotType = 'front' | 'left' | 'right' | 'body'

interface VisualPrompt {
  step: number
  title: string
  type: SlotType
  prompt: string
}

interface RefImages {
  front?: string
  left?: string
  right?: string
  body?: string
}

interface CharacterData {
  id: string
  name: string
  selections: Record<string, string>
  customizations: Record<string, any>
  nicheType?: string
}

// ============================================
// VISUAL PROMPTS GENERATOR
// ============================================
function getVisualPrompts(character: CharacterData): VisualPrompt[] {
  const name = character.name || 'the character'
  const selections = character.selections || {}
  const customizations = character.customizations || {}
  const nicheType = character.nicheType || ''

  // Build a description hint from their selections
  let identityHint = ''
  if (selections.identity) {
    const bundle = BUNDLES.identity?.find(b => b.id === selections.identity)
    if (bundle) identityHint = bundle.name
  }
  let personalityHint = ''
  if (selections.personality) {
    const bundle = BUNDLES.personality?.find(b => b.id === selections.personality)
    if (bundle) personalityHint = bundle.name
  }

  const characterDesc = [identityHint, personalityHint, nicheType].filter(Boolean).join(', ') || 'AI influencer character'

  return [
    {
      step: 1,
      title: 'Front Face — The Blend',
      type: 'front' as SlotType,
      prompt: `I'm going to upload 3 photos of different people. I want you to blend their features into ONE new, original person that doesn't look exactly like any of them. Take the best features from each photo and combine them naturally.\n\nThis character is: ${characterDesc}\n\nRules:\n- Create ONE front-facing headshot\n- Neutral expression, looking directly at camera\n- Natural facial asymmetry, subtle skin texture, realistic pores\n- NO plastic or airbrushed look\n- Place the character on a clean white background with thin black grid lines (like graph paper)\n- Head and shoulders only\n- Photorealistic, shot on 35mm DSLR, shallow depth of field`,
    },
    {
      step: 2,
      title: 'Left Profile',
      type: 'left' as SlotType,
      prompt: `Using the character you just created, generate a LEFT PROFILE view (facing left, showing the left side of the face).\n\nRules:\n- Same exact person — same face, same skin, same hair, same features\n- Left side profile, head and shoulders\n- Neutral expression\n- Same clean white background with thin black grid lines\n- Photorealistic, same quality as the front-facing shot`,
    },
    {
      step: 3,
      title: 'Right Profile',
      type: 'right' as SlotType,
      prompt: `Using the same character, generate a RIGHT PROFILE view (facing right, showing the right side of the face).\n\nRules:\n- Same exact person — same face, same skin, same hair, same features\n- Right side profile, head and shoulders\n- Neutral expression\n- Same clean white background with thin black grid lines\n- Photorealistic, same quality as the previous shots`,
    },
    {
      step: 4,
      title: 'Full Body',
      type: 'body' as SlotType,
      prompt: `Using the same character, generate a FULL BODY shot. Standing naturally, facing the camera.\n\nRules:\n- Same exact person — same face, same skin, same hair\n- Full body from head to feet, standing pose\n- Wearing a casual outfit that fits a ${characterDesc} style\n- Same clean white background with thin black grid lines\n- Photorealistic, same quality as the previous shots`,
    },
  ]
}

// ============================================
// GRID GUIDE SVG — placeholder for empty slots
// ============================================
function GridGuide({ type }: { type: SlotType }) {
  const width = 120
  const height = 160
  const gridColor = '#333'
  const lineColor = '#555'

  // Simple SVG guide showing expected pose
  const guides: Record<SlotType, JSX.Element> = {
    front: (
      <g>
        <circle cx="60" cy="50" r="25" fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="60" y1="75" x2="60" y2="130" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="35" y1="95" x2="85" y2="95" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
      </g>
    ),
    left: (
      <g>
        <ellipse cx="55" cy="50" rx="22" ry="25" fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="55" y1="75" x2="55" y2="130" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="60" y="145" textAnchor="middle" fill={lineColor} fontSize="8">LEFT</text>
      </g>
    ),
    right: (
      <g>
        <ellipse cx="65" cy="50" rx="22" ry="25" fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="65" y1="75" x2="65" y2="130" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="60" y="145" textAnchor="middle" fill={lineColor} fontSize="8">RIGHT</text>
      </g>
    ),
    body: (
      <g>
        <circle cx="60" cy="30" r="15" fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="60" y1="45" x2="60" y2="110" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="35" y1="65" x2="85" y2="65" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="60" y1="110" x2="45" y2="150" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="60" y1="110" x2="75" y2="150" stroke={lineColor} strokeWidth="1.5" strokeDasharray="4 2" />
      </g>
    ),
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ background: '#1a1a2e' }}>
      {/* Grid lines */}
      {Array.from({ length: Math.ceil(width / 20) }).map((_, i) => (
        <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2={height} stroke={gridColor} strokeWidth="0.5" />
      ))}
      {Array.from({ length: Math.ceil(height / 20) }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 20} x2={width} y2={i * 20} stroke={gridColor} strokeWidth="0.5" />
      ))}
      {guides[type]}
    </svg>
  )
}

// ============================================
// SLOT LABELS
// ============================================
const SLOT_LABELS: Record<SlotType, string> = {
  front: 'Front Face',
  left: 'Left Profile',
  right: 'Right Profile',
  body: 'Full Body',
}

const SLOTS: SlotType[] = ['front', 'left', 'right', 'body']

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
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const [uploading, setUploading] = useState<SlotType | null>(null)
  const [refImages, setRefImages] = useState<RefImages>(
    (character.customizations?.refImages as RefImages) || {}
  )
  const [showGuide, setShowGuide] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs for hidden file inputs
  const fileInputRefs = useRef<Record<SlotType, HTMLInputElement | null>>({
    front: null,
    left: null,
    right: null,
    body: null,
  })

  const prompts = getVisualPrompts(character)

  const filledCount = SLOTS.filter(s => refImages[s]).length

  // ============================================
  // HANDLERS
  // ============================================
  async function handleCopy(prompt: string, step: number) {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedStep(step)
      setTimeout(() => setCopiedStep(null), 2000)
    } catch {
      // Fallback for mobile
      const textarea = document.createElement('textarea')
      textarea.value = prompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedStep(step)
      setTimeout(() => setCopiedStep(null), 2000)
    }
  }

  async function handleUpload(slot: SlotType, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WEBP)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB')
      return
    }

    setError(null)
    setUploading(slot)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('characterId', character.id)
      formData.append('slot', slot)

      const res = await fetch('/api/characters/images', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      const newRefImages = { ...refImages, [slot]: data.url }
      setRefImages(newRefImages)

      if (onUpdate) onUpdate()
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(null)
      // Reset file input so same file can be re-uploaded
      if (fileInputRefs.current[slot]) {
        fileInputRefs.current[slot]!.value = ''
      }
    }
  }

  function triggerUpload(slot: SlotType) {
    fileInputRefs.current[slot]?.click()
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="h-full overflow-y-auto p-4 pb-8">
      <div className="max-w-lg mx-auto">
        {/* Back button */}
        {onBack && (
          <button
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
        <p className="text-sm text-continuum-muted mb-4 leading-relaxed">
          Use an AI image tool to create your character&apos;s face. Follow each step in order — paste the prompt, get the image, upload it here.
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-continuum-muted">{filledCount} of 4 images uploaded</span>
            {filledCount === 4 && <span className="text-xs text-green-400 font-medium">Complete!</span>}
          </div>
          <div className="w-full h-1.5 bg-continuum-border rounded-full">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${(filledCount / 4) * 100}%`,
                background: filledCount === 4
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
              }}
            />
          </div>
        </div>

        {/* Onboarding Guide */}
        <div className="mb-5">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-continuum-accent/50 text-continuum-accent text-xs font-semibold hover:bg-continuum-accent/10 transition"
          >
            {showGuide ? '▲ Hide Guide' : '🆕 First time? Here\'s how it works'}
          </button>

          {showGuide && (
            <div className="mt-3 p-4 rounded-xl border border-continuum-border bg-continuum-surface text-sm leading-relaxed text-continuum-text">
              <div className="font-bold text-base mb-3 text-white">Complete Walkthrough (8 steps)</div>

              <div className="space-y-3">
                <GuideStep
                  num={1}
                  title="Find 3 photos of people you like the look of"
                  desc="Go to Google, Pinterest, or Instagram. Find 3 photos of different real people whose features you want to combine. Example: you like Person A's eyes, Person B's jawline, and Person C's hair. Save all 3 photos."
                />
                <GuideStep
                  num={2}
                  title="Open an AI image tool"
                  desc="You need an AI that can generate images from photos. Pick whichever one you have — ChatGPT (chatgpt.com), Claude (claude.ai), or Gemini (gemini.google.com). Start a new conversation."
                />
                <GuideStep
                  num={3}
                  title="Upload your 3 photos to the AI"
                  desc="In your new conversation, click the paperclip/attachment button. Select all 3 photos. You'll see them as thumbnails. Don't send yet — add the prompt first."
                />
                <GuideStep
                  num={4}
                  title="Copy and paste the first prompt"
                  desc='Come back here. Click "Step 1: Front Face — The Blend" below to expand it. Hit "Copy Prompt". Go to your AI tool, paste it, and hit Send. The AI will create a brand new face.'
                />
                <GuideStep
                  num={5}
                  title="Save the image the AI gives you"
                  desc='When the AI shows you the generated image, click on it to make it bigger. Right-click → "Save image as..." (computer) or long-press → "Save to Photos" (phone).'
                />
                <GuideStep
                  num={6}
                  title="Upload it back here"
                  desc='Come back here. Click the empty "Front Face" box above, or click "Upload Result" inside Step 1. Find the image you saved and select it.'
                />
                <GuideStep
                  num={7}
                  title="Repeat for the other 3 angles"
                  desc="Do the exact same thing for Steps 2, 3, and 4. Important — stay in the SAME conversation. The AI remembers your character and keeps the face consistent."
                />
                <GuideStep
                  num={8}
                  title="You're done!"
                  desc="Once all 4 slots have images, your character's visual identity is locked in. These reference images are what the Content Factory will use to generate new content."
                />
              </div>

              <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-continuum-muted">
                <strong className="text-purple-300">Pro tip:</strong> If you don&apos;t like how the face turned out, tell the AI what to change — &quot;make the nose smaller&quot;, &quot;give them curlier hair&quot;. Keep tweaking until you love it.
              </div>
            </div>
          )}
        </div>

        {/* Reference Image Slots — 2x2 grid on mobile, 4 columns on wider screens */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {SLOTS.map(slot => (
            <div key={slot} className="text-center">
              <div
                onClick={() => triggerUpload(slot)}
                className={`w-full aspect-[3/4] rounded-xl overflow-hidden cursor-pointer relative transition-all ${
                  refImages[slot]
                    ? 'border-2 border-continuum-accent shadow-lg shadow-continuum-accent/20'
                    : 'border-2 border-dashed border-continuum-border hover:border-continuum-accent/50'
                }`}
              >
                {refImages[slot] ? (
                  <img
                    src={refImages[slot]}
                    alt={SLOT_LABELS[slot]}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-continuum-bg">
                    <GridGuide type={slot} />
                  </div>
                )}

                {/* Upload overlay */}
                {uploading === slot && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-5 h-5 border-2 border-continuum-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-continuum-accent font-medium">Uploading...</span>
                    </div>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={el => { fileInputRefs.current[slot] = el }}
                  onChange={(e) => handleUpload(slot, e)}
                />
              </div>
              <div className={`text-xs mt-1.5 ${refImages[slot] ? 'text-continuum-accent font-semibold' : 'text-continuum-muted'}`}>
                {refImages[slot] ? '✓ ' : ''}{SLOT_LABELS[slot]}
              </div>
            </div>
          ))}
        </div>

        {/* Step-by-step prompts */}
        <div className="space-y-3">
          {prompts.map(p => (
            <div
              key={p.step}
              className="rounded-xl border border-continuum-border bg-continuum-surface overflow-hidden"
            >
              {/* Step header — clickable accordion */}
              <button
                onClick={() => setActiveStep(activeStep === p.step ? null : p.step)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-continuum-bg/50 transition"
              >
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className={refImages[p.type] ? 'text-green-400' : 'text-continuum-muted'}>
                    {refImages[p.type] ? '✓' : p.step}
                  </span>
                  {p.title}
                </span>
                <span className="text-continuum-muted text-xs">
                  {activeStep === p.step ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded content */}
              {activeStep === p.step && (
                <div className="px-4 pb-4 border-t border-continuum-border">
                  <div className="flex gap-3 mt-3">
                    {/* Mini guide illustration */}
                    <div className="flex-shrink-0 w-20 rounded-lg overflow-hidden border border-continuum-border">
                      <GridGuide type={p.type} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-continuum-muted mb-2">
                        {p.step === 1
                          ? 'Open ChatGPT, paste this prompt, then upload your 3 reference photos:'
                          : 'In the same AI conversation, paste this prompt:'}
                      </p>

                      {/* Prompt box */}
                      <div className="p-3 rounded-lg bg-continuum-bg border border-continuum-border font-mono text-[11px] leading-relaxed text-continuum-text max-h-36 overflow-y-auto whitespace-pre-wrap">
                        {p.prompt}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleCopy(p.prompt, p.step)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            copiedStep === p.step
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25'
                          }`}
                        >
                          {copiedStep === p.step ? '✓ Copied!' : '📋 Copy Prompt'}
                        </button>
                        <button
                          onClick={() => triggerUpload(p.type)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-continuum-surface text-continuum-muted border border-continuum-border hover:text-white hover:border-continuum-accent/30 transition"
                        >
                          📤 Upload Result
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Completion banner */}
        {filledCount === 4 && (
          <div className="mt-5 p-4 rounded-xl text-center bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30">
            <div className="text-base font-bold text-green-400 mb-1">
              ✓ {character.name}&apos;s visual identity is locked in!
            </div>
            <p className="text-xs text-continuum-muted">
              These reference images will be used by the Content Factory to generate on-brand content.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// GUIDE STEP — helper for the onboarding walkthrough
// ============================================
function GuideStep({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div>
      <div className="font-bold text-continuum-accent text-sm">Step {num}: {title}</div>
      <div className="text-xs text-continuum-muted mt-0.5">{desc}</div>
    </div>
  )
}
