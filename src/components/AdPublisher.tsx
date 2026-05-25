'use client'

import React, { useState, useEffect } from 'react'

// ============================================
// Types
// ============================================
interface ContentPiece {
  contentType: string
  platform?: string
  content: string
  hashtags?: string[]
  daySuggestion?: string
  photoSuggestion?: string
  needsUserPhoto?: boolean
}

interface FacebookAccount {
  id: string
  fbPageId: string
  fbPageName: string
  igAccountId?: string
  adAccountId: string
}

interface AdPublisherProps {
  piece: ContentPiece
  onClose: () => void
  onPublished: () => void
}

// ============================================
// Step Components
// ============================================

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
            i < current ? 'bg-emerald-500 text-white' :
            i === current ? 'bg-continuum-accent text-white' :
            'bg-continuum-surface border border-continuum-border text-continuum-muted'
          }`}>
            {i < current ? '\u2713' : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 ${i < current ? 'bg-emerald-500' : 'bg-continuum-border'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================
// Main AdPublisher Component
// ============================================
export default function AdPublisher({ piece, onClose, onPublished }: AdPublisherProps) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<FacebookAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [connectingFb, setConnectingFb] = useState(false)

  // Ad config state
  const [objective, setObjective] = useState('OUTCOME_AWARENESS')
  const [adFormat, setAdFormat] = useState<'image' | 'video' | 'carousel'>('image')
  const [headline, setHeadline] = useState('')
  const [primaryText, setPrimaryText] = useState(piece.content)
  const [callToAction, setCallToAction] = useState('LEARN_MORE')
  const [linkUrl, setLinkUrl] = useState('')

  // Targeting
  const [ageMin, setAgeMin] = useState(18)
  const [ageMax, setAgeMax] = useState(65)
  const [genders, setGenders] = useState<number[]>([0]) // 0=all, 1=male, 2=female
  const [locations, setLocations] = useState<string[]>(['US'])
  const [interests, setInterests] = useState<string[]>([])
  const [interestSearch, setInterestSearch] = useState('')
  const [interestResults, setInterestResults] = useState<any[]>([])

  // Budget
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily')
  const [budgetAmount, setBudgetAmount] = useState('10')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Publishing state
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<any>(null)

  // Load connected Facebook accounts
  useEffect(() => {
    fetchAccounts()
  }, [])

  // Set default dates
  useEffect(() => {
    const now = new Date()
    const start = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
    setStartDate(start.toISOString().slice(0, 16))
    setEndDate(end.toISOString().slice(0, 16))
  }, [])

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/meta/accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts || [])
        if (data.accounts?.length > 0) {
          setSelectedAccount(data.accounts[0].id)
        }
      }
    } catch {}
  }

  async function connectFacebook() {
    setConnectingFb(true)
    try {
      const res = await fetch('/api/meta/connect')
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.url
      }
    } catch {
      setError('Failed to start Facebook connection')
    }
    setConnectingFb(false)
  }

  async function searchInterests(query: string) {
    if (query.length < 2) { setInterestResults([]); return }
    try {
      const res = await fetch(`/api/ads/targeting/interests?q=${encodeURIComponent(query)}&facebookAccountId=${selectedAccount}`)
      if (res.ok) {
        const data = await res.json()
        setInterestResults(data.interests || [])
      }
    } catch {}
  }

  async function publishAd() {
    setPublishing(true)
    setError('')
    try {
      const res = await fetch('/api/ads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facebookAccountId: selectedAccount,
          contentType: piece.contentType,
          content: primaryText,
          headline,
          callToAction,
          linkUrl: linkUrl || undefined,
          objective,
          adFormat,
          targeting: {
            ageMin,
            ageMax,
            genders,
            geoLocations: { countries: locations },
            interests: interests.map(i => ({ id: i, name: i })),
          },
          budget: {
            type: budgetType,
            amount: Math.round(parseFloat(budgetAmount) * 100),
            currency: 'USD',
          },
          schedule: {
            startTime: new Date(startDate).toISOString(),
            endTime: endDate ? new Date(endDate).toISOString() : undefined,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create ad')
      }

      const data = await res.json()
      setPublishResult(data)
      setStep(4) // success step
    } catch (err: any) {
      setError(err.message || 'Failed to publish ad')
    }
    setPublishing(false)
  }

  const steps = ['Connect', 'Content', 'Targeting', 'Budget', 'Done']

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-continuum-bg border border-continuum-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-continuum-border">
          <h2 className="text-lg font-semibold text-continuum-accent">Publish as Ad</h2>
          <button onClick={onClose} className="text-continuum-muted hover:text-white text-xl">&times;</button>
        </div>

        <div className="p-4">
          <StepIndicator current={step} total={steps.length} />

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Step 0: Connect Facebook */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">Connect Facebook</h3>
              {accounts.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-continuum-muted mb-4">Connect your Facebook account to publish ads.</p>
                  <button
                    onClick={connectFacebook}
                    disabled={connectingFb}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition disabled:opacity-50"
                  >
                    {connectingFb ? 'Connecting...' : 'Connect Facebook'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-continuum-muted">Select your ad account:</p>
                  {accounts.map(acc => (
                    <label key={acc.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      selectedAccount === acc.id
                        ? 'border-continuum-accent bg-continuum-accent/10'
                        : 'border-continuum-border hover:border-continuum-accent/50'
                    }`}>
                      <input
                        type="radio"
                        name="account"
                        checked={selectedAccount === acc.id}
                        onChange={() => setSelectedAccount(acc.id)}
                        className="accent-continuum-accent"
                      />
                      <div>
                        <span className="text-sm font-medium text-white">{acc.fbPageName}</span>
                        {acc.igAccountId && <span className="text-xs text-continuum-muted block">Instagram connected</span>}
                      </div>
                    </label>
                  ))}
                  <button
                    onClick={() => setStep(1)}
                    disabled={!selectedAccount}
                    className="w-full mt-4 py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim text-white font-medium transition disabled:opacity-30"
                  >
                    Next: Set Up Content
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Content & Creative */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">Ad Content</h3>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Campaign Objective</label>
                <select
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                >
                  <option value="OUTCOME_AWARENESS">Brand Awareness</option>
                  <option value="OUTCOME_TRAFFIC">Website Traffic</option>
                  <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                  <option value="OUTCOME_LEADS">Lead Generation</option>
                  <option value="OUTCOME_SALES">Sales / Conversions</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Primary Text</label>
                <textarea
                  value={primaryText}
                  onChange={e => setPrimaryText(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Headline</label>
                <input
                  type="text"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="Your attention-grabbing headline"
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Call to Action</label>
                <select
                  value={callToAction}
                  onChange={e => setCallToAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                >
                  <option value="LEARN_MORE">Learn More</option>
                  <option value="SHOP_NOW">Shop Now</option>
                  <option value="SIGN_UP">Sign Up</option>
                  <option value="BOOK_NOW">Book Now</option>
                  <option value="CONTACT_US">Contact Us</option>
                  <option value="GET_OFFER">Get Offer</option>
                  <option value="DOWNLOAD">Download</option>
                  <option value="WATCH_MORE">Watch More</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Link URL (optional)</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://yourbusiness.com"
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-xl bg-continuum-surface border border-continuum-border text-continuum-muted font-medium transition hover:text-white">
                  Back
                </button>
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim text-white font-medium transition">
                  Next: Targeting
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Targeting */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">Audience Targeting</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-continuum-muted mb-1">Min Age</label>
                  <input
                    type="number"
                    value={ageMin}
                    onChange={e => setAgeMin(parseInt(e.target.value) || 18)}
                    min={18} max={65}
                    className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-continuum-muted mb-1">Max Age</label>
                  <input
                    type="number"
                    value={ageMax}
                    onChange={e => setAgeMax(parseInt(e.target.value) || 65)}
                    min={18} max={65}
                    className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Gender</label>
                <div className="flex gap-2">
                  {[{ v: [0], l: 'All' }, { v: [1], l: 'Male' }, { v: [2], l: 'Female' }].map(opt => (
                    <button
                      key={opt.l}
                      onClick={() => setGenders(opt.v)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                        JSON.stringify(genders) === JSON.stringify(opt.v)
                          ? 'bg-continuum-accent text-white'
                          : 'bg-continuum-surface border border-continuum-border text-continuum-muted hover:text-white'
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Countries</label>
                <select
                  value={locations[0]}
                  onChange={e => setLocations([e.target.value])}
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="JP">Japan</option>
                  <option value="BR">Brazil</option>
                  <option value="IN">India</option>
                  <option value="MX">Mexico</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Interests (optional)</label>
                <input
                  type="text"
                  value={interestSearch}
                  onChange={e => { setInterestSearch(e.target.value); searchInterests(e.target.value) }}
                  placeholder="Search interests..."
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                />
                {interestResults.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto bg-continuum-surface border border-continuum-border rounded-xl">
                    {interestResults.map((ir: any) => (
                      <button
                        key={ir.id}
                        onClick={() => {
                          if (!interests.includes(ir.name)) setInterests([...interests, ir.name])
                          setInterestSearch('')
                          setInterestResults([])
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-continuum-accent/10 transition"
                      >
                        {ir.name}
                      </button>
                    ))}
                  </div>
                )}
                {interests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {interests.map(i => (
                      <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-full bg-continuum-accent/20 text-continuum-accent text-xs">
                        {i}
                        <button onClick={() => setInterests(interests.filter(x => x !== i))} className="hover:text-white">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl bg-continuum-surface border border-continuum-border text-continuum-muted font-medium transition hover:text-white">
                  Back
                </button>
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim text-white font-medium transition">
                  Next: Budget
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Budget & Schedule */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">Budget & Schedule</h3>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Budget Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBudgetType('daily')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                      budgetType === 'daily'
                        ? 'bg-continuum-accent text-white'
                        : 'bg-continuum-surface border border-continuum-border text-continuum-muted hover:text-white'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setBudgetType('lifetime')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                      budgetType === 'lifetime'
                        ? 'bg-continuum-accent text-white'
                        : 'bg-continuum-surface border border-continuum-border text-continuum-muted hover:text-white'
                    }`}
                  >
                    Lifetime
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">
                  {budgetType === 'daily' ? 'Daily Budget (USD)' : 'Total Budget (USD)'}
                </label>
                <input
                  type="number"
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  min="1" step="1"
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">Start Date</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-continuum-muted mb-1">End Date (optional for daily budget)</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-continuum-surface border border-continuum-border text-sm text-white"
                />
              </div>

              {/* Cost summary */}
              <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-continuum-muted">Ad spend ({budgetType})</span>
                  <span className="text-white">${budgetAmount}/{ budgetType === 'daily' ? 'day' : 'total'}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-continuum-muted">Continuum service fee</span>
                  <span className="text-white">$1.00</span>
                </div>
                <div className="border-t border-continuum-border my-2" />
                <p className="text-xs text-continuum-muted">Ad spend is billed by Meta separately. The $1.00 service fee is charged from your Continuum wallet.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl bg-continuum-surface border border-continuum-border text-continuum-muted font-medium transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={publishAd}
                  disabled={publishing || !budgetAmount}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition disabled:opacity-30"
                >
                  {publishing ? 'Publishing...' : 'Publish Ad ($1.00)'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && publishResult && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Ad Published!</h3>
              <p className="text-sm text-continuum-muted">Your ad has been submitted to Meta for review. It usually takes 24 hours for approval.</p>
              <div className="p-3 rounded-xl bg-continuum-surface border border-continuum-border text-left">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-continuum-muted">Campaign</span>
                  <span className="text-white">{publishResult.campaign?.name || 'Created'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-continuum-muted">Status</span>
                  <span className="text-amber-400">Pending Review</span>
                </div>
              </div>
              <button
                onClick={() => { onPublished(); onClose() }}
                className="w-full py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim text-white font-medium transition"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
