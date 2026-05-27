'use client'

import React, { useState, useEffect } from 'react'

// ============================================
// VideoGenerator — standalone video creation UI
// Supports auto mode (fire-and-forget) and guided mode (pick character + prompt)
// Chat-based video gen remains untouched — this is an additional UI path
// ============================================

interface VideoGeneratorProps {
  characterId?: string
  characterName?: string
  mode?: 'auto' | 'guided'
  specs?: string
  onComplete?: (job: VideoJob) => void
  onClose?: () => void
}

interface VideoJob {
  id: string
  status: string
  characterName?: string
  script?: { title?: string }
  finalVideoUrl?: string
  totalCost?: number
  duration?: number
  errorMessage?: string
}

interface CharacterOption {
  id: string
  name: string
  isActive?: boolean
}

export default function VideoGenerator({
  characterId,
  characterName,
  mode,
  specs,
  onComplete,
  onClose,
}: VideoGeneratorProps) {
  const [step, setStep] = useState<'prompt' | 'generating' | 'done' | 'error'>('prompt')
  const [prompt, setPrompt] = useState(specs || '')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<VideoJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoLoading, setAutoLoading] = useState(mode === 'auto')
  const [characters, setCharacters] = useState<CharacterOption[]>([])
  const [selectedCharId, setSelectedCharId] = useState(characterId || '')
  const [pastJobs, setPastJobs] = useState<VideoJob[]>([])

  // ============================================
  // Fetch characters for selection (if not pre-selected)
  // ============================================
  useEffect(() => {
    if (!characterId) {
      fetch('/api/characters')
        .then(r => r.json())
        .then(data => {
          const chars = data.characters || data || []
          setCharacters(chars)
          const active = chars.find((c: CharacterOption) => c.isActive)
          if (active) setSelectedCharId(active.id)
          else if (chars.length > 0) setSelectedCharId(chars[0].id)
        })
        .catch(() => {})
    }
  }, [characterId])

  // ============================================
  // Fetch past video jobs
  // ============================================
  useEffect(() => {
    fetch('/api/videos/status')
      .then(r => r.json())
      .then(data => setPastJobs(data.jobs || []))
      .catch(() => {})
  }, [])

  // ============================================
  // Auto mode — fire off generation immediately
  // ============================================
  useEffect(() => {
    if (mode !== 'auto') return
    const cId = characterId || selectedCharId
    if (!cId) return

    const run = async () => {
      try {
        const res = await fetch('/api/videos/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: cId, prompt: specs || '' }),
        })
        const data = await res.json()
        if (data.success && data.jobId) {
          setJobId(data.jobId)
          setStep('generating')
        } else {
          setError(data.error || 'Failed to start video')
          setStep('error')
        }
      } catch (e) {
        setError('Failed to start video generation')
        setStep('error')
      }
      setAutoLoading(false)
    }
    run()
  }, [mode, selectedCharId])

  // ============================================
  // Poll for job status while generating
  // ============================================
  useEffect(() => {
    if (!jobId || step !== 'generating') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/status?jobId=${jobId}`)
        const data = await res.json()
        setJobStatus(data)
        if (data.status === 'ready') {
          setStep('done')
          clearInterval(interval)
          if (onComplete) onComplete(data)
        } else if (data.status === 'failed') {
          setError(data.errorMessage || 'Video generation failed')
          setStep('error')
          clearInterval(interval)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [jobId, step])

  // ============================================
  // Start generation (guided mode button click)
  // ============================================
  const startGeneration = async () => {
    const cId = characterId || selectedCharId
    if (!cId) {
      setError('Please select a character first')
      return
    }
    setStep('generating')
    try {
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: cId, prompt }),
      })
      const data = await res.json()
      if (data.success && data.jobId) {
        setJobId(data.jobId)
      } else {
        setError(data.error || 'Failed to start video')
        setStep('error')
      }
    } catch {
      setError('Failed to start video generation')
      setStep('error')
    }
  }

  // ============================================
  // RENDER: Auto loading screen
  // ============================================
  if (autoLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">{'🎬'}</div>
          <p className="text-sm text-continuum-muted animate-pulse">Starting video generation...</p>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Generating progress tracker
  // ============================================
  if (step === 'generating') {
    const statusLabels: Record<string, string> = {
      pending: 'Queued...',
      scripting: 'Writing the script...',
      generating: 'Generating scenes...',
      stitching: 'Putting it all together...',
      ready: 'Done!',
    }
    const currentStatus = jobStatus?.status || 'pending'

    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4 animate-pulse">{'🎬'}</div>
          <h2 className="text-xl font-bold text-white mb-2">Creating Your Video</h2>
          <p className="text-sm text-continuum-muted mb-6">{statusLabels[currentStatus] || 'Processing...'}</p>

          <div className="space-y-2 text-left">
            {(['scripting', 'generating', 'stitching'] as const).map((s) => {
              const stages = ['pending', 'scripting', 'generating', 'stitching', 'ready']
              const currentIdx = stages.indexOf(currentStatus)
              const stageIdx = stages.indexOf(s)
              const isDone = currentIdx > stageIdx
              const isCurrent = currentStatus === s
              return (
                <div key={s} className={`flex items-center gap-2 text-sm ${isDone ? 'text-green-400' : isCurrent ? 'text-continuum-accent' : 'text-continuum-muted/50'}`}>
                  <span>{isDone ? '✓' : isCurrent ? '→' : '○'}</span>
                  <span>{s === 'scripting' ? 'Write script' : s === 'generating' ? 'Generate scenes' : 'Stitch final video'}</span>
                </div>
              )
            })}
          </div>

          {jobStatus?.totalCost != null && jobStatus.totalCost > 0 && (
            <p className="text-xs text-continuum-muted mt-4">Cost so far: ${'$'}{jobStatus.totalCost.toFixed(2)}</p>
          )}
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Done — show final video
  // ============================================
  if (step === 'done' && jobStatus) {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8">
        <div className="max-w-xl mx-auto text-center">
          <div className="text-5xl mb-4">{'🎬'}</div>
          <h2 className="text-2xl font-bold text-white mb-2">Video Ready!</h2>
          <p className="text-sm text-continuum-muted mb-6">
            {jobStatus.characterName && `Starring ${jobStatus.characterName}`}
            {jobStatus.duration ? ` · ${jobStatus.duration}s` : ''}
            {jobStatus.totalCost ? ` · $${jobStatus.totalCost.toFixed(2)}` : ''}
          </p>

          {jobStatus.finalVideoUrl && !jobStatus.finalVideoUrl.includes('placeholder') && (
            <div className="mb-6 rounded-xl overflow-hidden border border-continuum-border">
              <video src={jobStatus.finalVideoUrl} controls className="w-full" />
            </div>
          )}

          {jobStatus.script?.title && (
            <p className="text-sm text-continuum-muted italic mb-4">{jobStatus.script.title}</p>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setStep('prompt'); setJobId(null); setJobStatus(null); setError(null); }}
              className="px-6 py-3 rounded-xl text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white hover:border-continuum-accent/30 transition"
            >
              Make Another
            </button>
            {onClose && (
              <button onClick={onClose} className="px-6 py-3 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition">
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Error screen
  // ============================================
  if (step === 'error') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">{'😕'}</div>
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-red-400 mb-6">{error}</p>
          <button
            onClick={() => { setStep('prompt'); setError(null); }}
            className="px-6 py-3 rounded-xl text-sm font-medium text-continuum-muted border border-continuum-border hover:text-white hover:border-continuum-accent/30 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Main prompt screen (guided mode)
  // ============================================
  return (
    <div className="h-full overflow-y-auto p-4 pb-8">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{'🎬'}</div>
          <h2 className="text-2xl font-bold text-white mb-2">Video Generator</h2>
          <p className="text-sm text-continuum-muted">Create AI-powered videos starring your characters</p>
        </div>

        {!characterId && characters.length > 0 && (
          <div className="mb-6">
            <label className="text-sm text-continuum-muted block mb-2">Pick a character</label>
            <div className="grid grid-cols-2 gap-2">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCharId(c.id)}
                  className={`p-3 rounded-xl text-left text-sm border transition ${
                    selectedCharId === c.id
                      ? 'border-continuum-accent bg-continuum-accent/10 text-white'
                      : 'border-continuum-border bg-continuum-surface text-continuum-muted hover:border-continuum-accent/30'
                  }`}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.isActive && <span className="text-xs text-continuum-accent ml-1">Active</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="text-sm text-continuum-muted block mb-2">What should the video be about? (optional)</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder='e.g. "A motivational morning routine montage" or leave blank for AI to decide'
            rows={3}
            className="w-full px-4 py-3 bg-continuum-bg border border-continuum-border rounded-xl text-sm text-white placeholder-continuum-muted focus:border-continuum-accent focus:outline-none resize-none"
            autoFocus
          />
        </div>

        <div className="text-center mb-8">
          <button
            onClick={startGeneration}
            disabled={!selectedCharId && !characterId}
            className="px-8 py-3 rounded-xl text-sm font-semibold bg-continuum-accent text-white hover:bg-continuum-accent/80 transition disabled:bg-continuum-surface disabled:text-continuum-muted"
          >
            {'Generate Video →'}
          </button>
          <p className="text-xs text-continuum-muted mt-2">Uses video credits from your wallet</p>
        </div>

        {pastJobs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-continuum-muted mb-3">Previous Videos</h3>
            <div className="space-y-2">
              {pastJobs.slice(0, 5).map((job) => (
                <div key={job.id} className="p-3 rounded-xl bg-continuum-surface border border-continuum-border flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{job.characterName || 'Video'}</p>
                    <p className="text-xs text-continuum-muted">
                      {job.status === 'ready' ? '✓ Ready' : job.status === 'failed' ? '✕ Failed' : '⏳ ' + job.status}
                      {job.duration ? ` · ${job.duration}s` : ''}
                    </p>
                  </div>
                  {job.status === 'ready' && job.finalVideoUrl && !job.finalVideoUrl.includes('placeholder') && (
                    <a href={job.finalVideoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-continuum-accent hover:underline">
                      Watch
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
