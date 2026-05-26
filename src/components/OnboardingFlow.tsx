'use client'

import { useState } from 'react'

type Step = 'welcome' | 'name' | 'links' | 'scanning' | 'results' | 'done'

interface ScrapedData {
  business: {
    name: string | null
    businessType: string | null
    productsServices: string | null
    targetAudience: string | null
    brandVoice: string | null
    location: string | null
    websiteUrl: string | null
    socialLinks: Array<{ platform: string; url: string }>
  }
  personal: {
    name: string | null
    location: string | null
    interests: string[]
    background: string | null
    personality: string | null
    funFacts: string[]
  }
}

export default function OnboardingFlow({
  onComplete,
}: {
  aiName?: string
  onComplete: () => void
}) {
  const [step, setStep] = useState<Step>('welcome')
  const [chosenName, setChosenName] = useState('')
  const [linksText, setLinksText] = useState('')
  const [scraped, setScraped] = useState<ScrapedData | null>(null)
  const [scrapeError, setScrapeError] = useState('')
  const [saving, setSaving] = useState(false)

  // ============================================
  // Step: Welcome
  // ============================================
  if (step === 'welcome') {
    return (
      <OnboardingShell>
        <div className="w-16 h-16 rounded-full bg-continuum-accent/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-continuum-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-continuum-text mb-3">
          Welcome to Continuum
        </h2>
        <p className="text-continuum-muted text-sm leading-relaxed mb-2">
          You&apos;re about to create your own AI presence. Not a chatbot. Not an assistant.
        </p>
        <p className="text-continuum-muted text-sm leading-relaxed mb-8">
          A persistent AI that remembers you, learns your business, and evolves with you over time.
        </p>
        <button
          onClick={() => setStep('name')}
          className="w-full py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium"
        >
          Let&apos;s go
        </button>
      </OnboardingShell>
    )
  }

  // ============================================
  // Step: Name your AI
  // ============================================
  if (step === 'name') {
    return (
      <OnboardingShell>
        <StepDots current={0} total={4} />
        <h2 className="text-xl font-bold text-continuum-text mb-3">
          Name your AI
        </h2>
        <p className="text-continuum-muted text-sm leading-relaxed mb-6">
          This is the name of your AI presence. Pick something that feels right — you can always change it later.
        </p>
        <input
          type="text"
          value={chosenName}
          onChange={(e) => setChosenName(e.target.value)}
          placeholder="e.g. Nova, Atlas, Echo..."
          maxLength={30}
          className="w-full px-4 py-3 rounded-xl bg-continuum-surface border border-continuum-border text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent transition text-center text-lg"
          autoFocus
        />
        <button
          onClick={() => {
            if (chosenName.trim()) setStep('links')
          }}
          disabled={!chosenName.trim()}
          className="w-full py-3 mt-6 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </OnboardingShell>
    )
  }

  // ============================================
  // Step: Paste your links
  // ============================================
  if (step === 'links') {
    const handleScrape = async () => {
      if (!linksText.trim()) {
        // Skip scraping — go straight to done
        setStep('done')
        return
      }

      setStep('scanning')
      setScrapeError('')
      try {
        const res = await fetch('/api/onboarding/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: linksText }),
        })
        const data = await res.json()
        if (data.extracted) {
          setScraped(data.extracted)
          setStep('results')
        } else {
          setScrapeError(data.error || 'Could not read those links')
          setStep('links')
        }
      } catch {
        setScrapeError('Something went wrong. Try again.')
        setStep('links')
      }
    }

    return (
      <OnboardingShell>
        <StepDots current={1} total={4} />
        <h2 className="text-xl font-bold text-continuum-text mb-3">
          Help {chosenName} learn about you
        </h2>
        <p className="text-continuum-muted text-sm leading-relaxed mb-2">
          Paste any links — your website, Instagram, LinkedIn, Twitter, portfolio. Anything.
        </p>
        <p className="text-continuum-muted text-sm leading-relaxed mb-6">
          {chosenName} will read them and figure out what&apos;s about your business and what&apos;s about you personally.
        </p>
        <textarea
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          placeholder={"https://mywebsite.com\nhttps://instagram.com/myhandle\nhttps://linkedin.com/in/me"}
          rows={4}
          className="w-full px-4 py-3 rounded-xl bg-continuum-surface border border-continuum-border text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent transition text-sm resize-none"
          autoFocus
        />
        {scrapeError && (
          <p className="text-red-400 text-xs mt-2">{scrapeError}</p>
        )}
        <button
          onClick={handleScrape}
          className="w-full py-3 mt-6 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium"
        >
          {linksText.trim() ? `Let ${chosenName} learn` : 'Skip for now'}
        </button>
        <button
          onClick={() => setStep('name')}
          className="text-xs text-continuum-muted hover:text-continuum-text transition mt-3"
        >
          Back
        </button>
      </OnboardingShell>
    )
  }

  // ============================================
  // Step: Scanning animation
  // ============================================
  if (step === 'scanning') {
    return (
      <OnboardingShell>
        <StepDots current={2} total={4} />
        <div className="w-16 h-16 rounded-full bg-continuum-accent/20 flex items-center justify-center mx-auto mb-6 animate-pulse">
          <svg className="w-8 h-8 text-continuum-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-continuum-text mb-3">
          {chosenName} is reading...
        </h2>
        <p className="text-continuum-muted text-sm leading-relaxed">
          Scanning your links and sorting what&apos;s about your business vs. what&apos;s about you.
        </p>
      </OnboardingShell>
    )
  }

  // ============================================
  // Step: Show results
  // ============================================
  if (step === 'results' && scraped) {
    const hasBiz = scraped.business?.name
    const hasPersonal = scraped.personal?.name || scraped.personal?.interests?.length > 0 || scraped.personal?.background

    return (
      <OnboardingShell scroll>
        <StepDots current={2} total={4} />
        <h2 className="text-xl font-bold text-continuum-text mb-2">
          Here&apos;s what {chosenName} found
        </h2>
        <p className="text-continuum-muted text-xs mb-6">
          Everything was auto-sorted. You can edit this later in Settings.
        </p>

        {/* Business section */}
        {hasBiz && (
          <div className="w-full rounded-xl border border-continuum-border bg-continuum-surface p-4 mb-4 text-left">
            <h3 className="text-xs font-semibold text-continuum-accent uppercase tracking-wider mb-3">Your Business</h3>
            <InfoRow label="Name" value={scraped.business.name} />
            <InfoRow label="Type" value={scraped.business.businessType} />
            <InfoRow label="Products" value={scraped.business.productsServices} />
            <InfoRow label="Audience" value={scraped.business.targetAudience} />
            <InfoRow label="Voice" value={scraped.business.brandVoice} />
            <InfoRow label="Location" value={scraped.business.location} />
          </div>
        )}

        {/* Personal section */}
        {hasPersonal && (
          <div className="w-full rounded-xl border border-continuum-border bg-continuum-surface p-4 mb-4 text-left">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">About You</h3>
            <InfoRow label="Name" value={scraped.personal.name} />
            <InfoRow label="Location" value={scraped.personal.location} />
            <InfoRow label="Background" value={scraped.personal.background} />
            <InfoRow label="Personality" value={scraped.personal.personality} />
            {scraped.personal.interests?.length > 0 && (
              <InfoRow label="Interests" value={scraped.personal.interests.join(', ')} />
            )}
            {scraped.personal.funFacts?.length > 0 && (
              <InfoRow label="Fun facts" value={scraped.personal.funFacts.join(', ')} />
            )}
          </div>
        )}

        {!hasBiz && !hasPersonal && (
          <div className="w-full rounded-xl border border-continuum-border bg-continuum-surface p-4 mb-4">
            <p className="text-continuum-muted text-sm">Couldn&apos;t extract much from those links, but that&apos;s okay — {chosenName} will learn more as you chat.</p>
          </div>
        )}

        <button
          onClick={() => setStep('done')}
          className="w-full py-3 mt-2 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium"
        >
          Looks good
        </button>
      </OnboardingShell>
    )
  }

  // ============================================
  // Step: Done — save everything
  // ============================================
  if (step === 'done') {
    const handleFinish = async () => {
      setSaving(true)
      try {
        await fetch('/api/onboarding/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aiName: chosenName.trim(),
            business: scraped?.business || null,
            personal: scraped?.personal || null,
          }),
        })
      } catch {
        // Still complete onboarding even if save fails
      }
      setSaving(false)
      onComplete()
    }

    return (
      <OnboardingShell>
        <StepDots current={3} total={4} />
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-continuum-text mb-3">
          {chosenName} is ready
        </h2>
        <p className="text-continuum-muted text-sm leading-relaxed mb-2">
          {scraped ? `${chosenName} already knows about your business and a bit about you.` : `${chosenName} doesn't know much yet, but that's fine.`}
        </p>
        <p className="text-continuum-muted text-sm leading-relaxed mb-8">
          The more you chat, the smarter {chosenName} gets. You can always add more links later in Settings.
        </p>
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium disabled:opacity-60"
        >
          {saving ? 'Saving...' : `Start talking to ${chosenName}`}
        </button>
      </OnboardingShell>
    )
  }

  // Fallback
  return null
}

// ============================================
// Helpers
// ============================================
function OnboardingShell({ children, scroll }: { children: React.ReactNode; scroll?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center min-h-screen px-6 bg-continuum-bg ${scroll ? 'overflow-y-auto py-12' : ''}`}>
      <div className="max-w-sm w-full text-center space-y-0">
        {children}
      </div>
    </div>
  )
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition ${
            i === current ? 'bg-continuum-accent' : i < current ? 'bg-continuum-accent/40' : 'bg-continuum-border'
          }`}
        />
      ))}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="mb-2 last:mb-0">
      <span className="text-[10px] uppercase tracking-wider text-continuum-muted">{label}</span>
      <p className="text-sm text-continuum-text">{value}</p>
    </div>
  )
}
