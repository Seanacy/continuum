'use client'
import { useState, useMemo } from 'react'
import { compilePrompt, getBundle, CATEGORIES } from '@/lib/bundles'

// ─── Types ───
interface CharacterData {
  id: string
  name: string
  selections: Record<string, string>
  customizations: Record<string, any>
  nicheType?: string
  nicheAudience?: string
  missionStatement?: string
  uniqueEdge?: string
  contentPillars?: string[]
}

interface Props {
  character: CharacterData
  onBack: () => void
}

// ─── Section metadata for the breakdown view ───
const SECTION_INFO: Record<string, { title: string; icon: string; desc: string }> = {
  identity: { title: 'Who You Are', icon: '🪪', desc: 'The character\'s core identity and archetype' },
  backstory: { title: 'Your Backstory', icon: '📖', desc: 'Origin story — revealed naturally over time' },
  personality: { title: 'Core Personality', icon: '🎭', desc: 'Emotional wiring and temperament' },
  commstyle: { title: 'How You Talk', icon: '🗣️', desc: 'Voice, tone, vocabulary, energy' },
  niche: { title: 'Your World', icon: '🌍', desc: 'Area of expertise and conversation focus' },
  preferences: { title: 'What You Love', icon: '❤️', desc: 'Interests that color metaphors and enthusiasm' },
  goals: { title: 'What Drives You', icon: '🎯', desc: 'Background motivation shaping advice and perspective' },
  boundaries: { title: 'Your Boundaries', icon: '🚧', desc: 'Lines that trigger genuine emotional reactions' },
  beliefs: { title: 'What You Believe', icon: '💡', desc: 'Worldview that shapes philosophy and advice' },
  sales: { title: 'Sales Approach', icon: '💰', desc: 'Natural engagement and monetization style' },
  contentformat: { title: 'Content Format', icon: '📹', desc: 'How content is structured and delivered' },
}

// ─── Main Component ───
export default function BuildAssistant({ character, onBack }: Props) {
  const [tab, setTab] = useState<'prompt' | 'breakdown'>('prompt')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Compile the prompt from selections
  const compiled = useMemo(() => {
    return compilePrompt(
      character.selections || {},
      character.customizations || {},
      {
        nicheType: character.nicheType,
        nicheAudience: character.nicheAudience,
        missionStatement: character.missionStatement,
        uniqueEdge: character.uniqueEdge,
        contentPillars: character.contentPillars,
      }
    )
  }, [character])

  const wordCount = compiled.split(/\s+/).length
  const charCount = compiled.length

  // Get selected sections for breakdown
  const selectedSections = useMemo(() => {
    const sections: { key: string; icon: string; title: string; desc: string; bundleName: string; bundleDesc: string; customText?: string }[] = []
    if (!character.selections) return sections

    for (const cat of CATEGORIES) {
      const bundleId = character.selections[cat.key]
      if (!bundleId) continue
      const bundle = getBundle(cat.key, bundleId)
      if (!bundle) continue
      const info = SECTION_INFO[cat.key]
      if (!info) continue

      sections.push({
        key: cat.key,
        icon: info.icon,
        title: info.title,
        desc: info.desc,
        bundleName: bundle.name,
        bundleDesc: bundle.desc,
        customText: character.customizations?.[`${cat.key}_custom`],
      })
    }
    return sections
  }, [character])

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(compiled)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = compiled
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function saveCompiledPrompt() {
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
            compiledPrompt: compiled,
          },
          nicheType: character.nicheType,
          nicheAudience: character.nicheAudience,
          missionStatement: character.missionStatement,
          uniqueEdge: character.uniqueEdge,
          contentPillars: character.contentPillars,
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
          🤖 Build Assistant
        </h2>
        <p className="text-sm text-continuum-muted mt-1">
          {character.name}&apos;s compiled system prompt — the DNA that makes them who they are.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 px-4 py-2">
        <button
          onClick={() => setTab('prompt')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'prompt'
              ? 'bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/50'
              : 'bg-white/5 text-continuum-muted border border-white/10 hover:bg-white/10'
          }`}
        >
          📄 Full Prompt
        </button>
        <button
          onClick={() => setTab('breakdown')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'breakdown'
              ? 'bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/50'
              : 'bg-white/5 text-continuum-muted border border-white/10 hover:bg-white/10'
          }`}
        >
          🧩 Breakdown
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* ───── Full Prompt Tab ───── */}
        {tab === 'prompt' && (
          <>
            {/* Stats */}
            <div className="flex gap-3">
              <div className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-lg font-bold text-continuum-accent">{wordCount}</p>
                <p className="text-xs text-continuum-muted">Words</p>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-lg font-bold text-continuum-accent">{charCount}</p>
                <p className="text-xs text-continuum-muted">Characters</p>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-lg font-bold text-continuum-accent">{selectedSections.length}</p>
                <p className="text-xs text-continuum-muted">Sections</p>
              </div>
            </div>

            {/* Prompt Text */}
            <div className="relative">
              <pre className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-continuum-text/80 whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                {compiled}
              </pre>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={copyPrompt}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-continuum-accent text-white hover:bg-continuum-accent/80'
                }`}
              >
                {copied ? '✓ Copied!' : '📋 Copy Prompt'}
              </button>
              <button
                onClick={saveCompiledPrompt}
                disabled={saving}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  saved
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
              >
                {saving ? 'Saving...' : saved ? '✓ Saved!' : '💾 Save to Character'}
              </button>
            </div>

            {/* Info */}
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-300">
                🤖 This is the system prompt that defines your character&apos;s entire personality. Copy it to use in any AI platform (ChatGPT, Claude, etc.) or save it to {character.name}&apos;s profile to power their conversations in Continuum.
              </p>
            </div>
          </>
        )}

        {/* ───── Breakdown Tab ───── */}
        {tab === 'breakdown' && (
          <>
            {selectedSections.length === 0 ? (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-sm text-continuum-muted">
                  No traits selected yet. Go back to the character builder and pick some traits first.
                </p>
              </div>
            ) : (
              <>
                {selectedSections.map(section => (
                  <div key={section.key} className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{section.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold">{section.title}</p>
                        <p className="text-xs text-continuum-muted mb-2">{section.desc}</p>
                        <div className="p-2 rounded bg-white/5">
                          <p className="text-sm">
                            <span className="text-continuum-accent font-medium">{section.bundleName}</span>
                            <span className="text-continuum-muted"> — {section.bundleDesc}</span>
                          </p>
                        </div>
                        {section.customText && (
                          <div className="mt-2 p-2 rounded bg-indigo-500/10 border border-indigo-500/20">
                            <p className="text-xs text-indigo-300">
                              ✏️ Custom: {section.customText}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Platform Strategy Section */}
                {(character.nicheType || character.nicheAudience || character.missionStatement || character.uniqueEdge) && (
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🚀</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold">Platform Strategy</p>
                        <p className="text-xs text-continuum-muted mb-2">Niche focus, audience, and mission</p>
                        <div className="space-y-1">
                          {character.nicheType && (
                            <p className="text-xs"><span className="text-continuum-accent">Niche:</span> {character.nicheType}</p>
                          )}
                          {character.nicheAudience && (
                            <p className="text-xs"><span className="text-continuum-accent">Audience:</span> {character.nicheAudience}</p>
                          )}
                          {character.missionStatement && (
                            <p className="text-xs"><span className="text-continuum-accent">Mission:</span> {character.missionStatement}</p>
                          )}
                          {character.uniqueEdge && (
                            <p className="text-xs"><span className="text-continuum-accent">Unique Edge:</span> {character.uniqueEdge}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Master Rules Section */}
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚡</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Master Rules</p>
                      <p className="text-xs text-continuum-muted mb-2">8 rules that keep the character consistent</p>
                      <div className="space-y-1 text-xs text-continuum-text/70">
                        <p>• Stay in character at all times</p>
                        <p>• Never break character unprompted</p>
                        <p>• Reveal backstory naturally over time</p>
                        <p>• Match communication style in every message</p>
                        <p>• Keep responses concise (2-4 sentences)</p>
                        <p>• Have opinions, favorites, and pet peeves</p>
                        <p>• Reference past and interests naturally</p>
                        <p>• Steer back to niche when possible</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
