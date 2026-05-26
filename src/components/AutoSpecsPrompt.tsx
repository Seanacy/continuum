'use client'

import { useState } from 'react'

interface AutoSpecsPromptProps {
  title?: string
  subtitle?: string
  placeholder?: string
  emoji?: string
  onSubmit: (specs: string) => void
  onSkip: () => void
  loading?: boolean
}

export default function AutoSpecsPrompt({
  title = 'Any specifications?',
  subtitle = 'Tell the AI what you have in mind, or skip and let it decide everything.',
  placeholder = 'e.g. "A bold fitness coach who uses humor and speaks to busy moms"',
  emoji = '✨',
  onSubmit,
  onSkip,
  loading = false,
}: AutoSpecsPromptProps) {
  const [specs, setSpecs] = useState('')

  return (
    <div className="h-full overflow-y-auto p-4 pb-8">
      <div className="max-w-xl mx-auto text-center">
        <span className="text-5xl block mb-4">{emoji}</span>
        <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-continuum-muted mb-8">{subtitle}</p>

        <textarea
          value={specs}
          onChange={e => setSpecs(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full px-4 py-3 bg-continuum-bg border border-continuum-border rounded-xl text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none mb-6"
          disabled={loading}
          autoFocus
        />

        <div className="flex gap-3 justify-center">
          <button
            onClick={onSkip}
            disabled={loading}
            className="px-6 py-3 rounded-xl text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white hover:border-continuum-accent/30 transition"
          >
            Skip — surprise me
          </button>
          <button
            onClick={() => onSubmit(specs.trim() || '')}
            disabled={loading}
            className="px-8 py-3 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition disabled:bg-continuum-surface disabled:text-continuum-muted"
          >
            {loading ? 'Working...' : "Let's Go →"}
          </button>
        </div>
      </div>
    </div>
  )
}
