'use client'

import { useState } from 'react'

// Post-signup welcome screen that introduces the AI
export default function OnboardingFlow({
  aiName,
  onComplete,
}: {
  aiName: string
  onComplete: () => void
}) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      title: `Meet ${aiName}`,
      body: `${aiName} is your persistent AI presence. Not a chatbot. Not an assistant. A continuous relationship that remembers you and evolves over time.`,
    },
    {
      title: 'Continuity, not sessions',
      body: `Every conversation picks up where you left off. ${aiName} remembers what you've said, what you're working on, and what matters to you.`,
    },
    {
      title: 'Your feed',
      body: `${aiName} will surface thoughts, reflections, and check-ins in your feed. Everything references something real — your words, your goals, your patterns.`,
    },
  ]

  const isLast = step === steps.length - 1

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-continuum-bg">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition ${
                i === step ? 'bg-continuum-accent' : 'bg-continuum-border'
              }`}
            />
          ))}
        </div>

        <h2 className="text-xl font-bold text-continuum-text">
          {steps[step].title}
        </h2>

        <p className="text-continuum-muted text-sm leading-relaxed">
          {steps[step].body}
        </p>

        <button
          onClick={() => {
            if (isLast) {
              onComplete()
            } else {
              setStep(step + 1)
            }
          }}
          className="w-full py-3 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium"
        >
          {isLast ? 'Start talking' : 'Next'}
        </button>

        {!isLast && (
          <button
            onClick={onComplete}
            className="text-xs text-continuum-muted hover:text-continuum-text transition"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
