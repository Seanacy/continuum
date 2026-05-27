'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

function OrbCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number; speed: number }[] = []
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.3 + 0.05,
        speed: Math.random() * 0.5 + 0.5,
      })
    }

    const animate = () => {
      time += 0.005
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const cx = canvas.width / 2
      const cy = canvas.height * 0.35

      const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300)
      outerGlow.addColorStop(0, 'rgba(99, 102, 241, 0.08)')
      outerGlow.addColorStop(0.5, 'rgba(99, 102, 241, 0.03)')
      outerGlow.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.fillStyle = outerGlow
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const breathe = Math.sin(time * 2) * 0.15 + 1
      const orbRadius = 60 * breathe

      const ringGlow = ctx.createRadialGradient(cx, cy, orbRadius * 0.8, cx, cy, orbRadius * 2.5)
      ringGlow.addColorStop(0, 'rgba(99, 102, 241, 0.12)')
      ringGlow.addColorStop(0.4, 'rgba(99, 102, 241, 0.05)')
      ringGlow.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = ringGlow
      ctx.fill()

      const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbRadius)
      orbGrad.addColorStop(0, `rgba(99, 102, 241, ${0.35 + Math.sin(time * 3) * 0.1})`)
      orbGrad.addColorStop(0.6, `rgba(99, 102, 241, ${0.15 + Math.sin(time * 2) * 0.05})`)
      orbGrad.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius, 0, Math.PI * 2)
      ctx.fillStyle = orbGrad
      ctx.fill()

      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbRadius * 0.3)
      coreGrad.addColorStop(0, `rgba(129, 140, 248, ${0.4 + Math.sin(time * 4) * 0.1})`)
      coreGrad.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      particles.forEach((p) => {
        p.x += p.vx * p.speed
        p.y += p.vy * p.speed

        const dx = cx - p.x
        const dy = cy - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 350) {
          p.vx += dx * 0.00003
          p.vy += dy * 0.00003
        }

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        const particleOpacity = p.opacity * (0.7 + Math.sin(time * 3 + p.x * 0.01) * 0.3)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${particleOpacity})`
        ctx.fill()

        particles.forEach((p2) => {
          const d = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2)
          if (d < 100 && d > 0) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(99, 102, 241, ${0.03 * (1 - d / 100)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      style={{ background: 'transparent' }}
    />
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="relative p-6 rounded-2xl border border-continuum-border/50 bg-continuum-surface/30 backdrop-blur-sm hover:border-continuum-accent/30 transition-all duration-500 group">
      <div className="mb-4 text-continuum-accent/70 group-hover:text-continuum-accent transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-continuum-text mb-2">{title}</h3>
      <p className="text-sm text-continuum-muted leading-relaxed">{description}</p>
    </div>
  )
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-continuum-accent/10 border border-continuum-accent/30 flex items-center justify-center">
        <span className="text-sm font-semibold text-continuum-accent">{number}</span>
      </div>
      <div>
        <h4 className="text-base font-medium text-continuum-text mb-1">{title}</h4>
        <p className="text-sm text-continuum-muted leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <OrbCanvas />

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="space-y-3 mb-6">
          <h1 className="text-5xl sm:text-7xl font-light tracking-widest text-continuum-text/90 uppercase">
            Continuum
          </h1>
          <div className="h-px w-16 mx-auto bg-gradient-to-r from-transparent via-continuum-accent/40 to-transparent" />
        </div>

        <p className="text-continuum-muted text-base sm:text-lg tracking-wide font-light max-w-md mx-auto leading-relaxed mb-8">
          An AI that actually knows you. It listens, remembers,
          and builds content that sounds like you wrote it.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <Link
            href="/signup"
            className="px-8 py-3 rounded-full text-sm tracking-wider text-white/90 bg-continuum-accent/20 border border-continuum-accent/30 hover:bg-continuum-accent/30 hover:border-continuum-accent/50 transition-all duration-500 backdrop-blur-sm"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 rounded-full text-sm tracking-wider text-continuum-muted/80 border border-continuum-border/50 hover:border-continuum-accent/40 hover:text-continuum-text transition-all duration-500 backdrop-blur-sm"
          >
            Log In
          </Link>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-continuum-muted/40">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-light text-continuum-text tracking-wide mb-4">
            What Continuum Does
          </h2>
          <p className="text-continuum-muted text-sm sm:text-base max-w-lg mx-auto">
            Most AI forgets you the moment you close the tab. Continuum remembers everything and uses it to help you create.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            title="Persistent Memory"
            description="Every conversation adds to what your AI knows about you. Your goals, preferences, and history stay with it forever."
          />
          <FeatureCard
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            }
            title="Voice In & Out"
            description="Talk to your AI with your voice. It talks back in a natural-sounding voice you choose. Feels like a real conversation."
          />
          <FeatureCard
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            }
            title="Camera Vision"
            description="Show your AI what you're looking at. It can read documents, analyze photos, and understand visual context in real time."
          />
          <FeatureCard
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            }
            title="Content Generation"
            description="Blog posts, social captions, marketing copy — all written in your voice. Because it knows you, the output actually sounds like you."
          />
          <FeatureCard
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            }
            title="AI Characters"
            description="Create custom AI personalities for different use cases — a business advisor, creative partner, or personal coach. Switch between them anytime."
          />
          <FeatureCard
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            }
            title="Your Feed"
            description="Your AI generates content ideas, insights, and suggestions in a scrollable feed — like social media, but just for you."
          />
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative z-10 px-6 py-24 max-w-2xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-light text-continuum-text tracking-wide mb-4">
            How It Works
          </h2>
          <p className="text-continuum-muted text-sm sm:text-base">
            Up and running in under 2 minutes.
          </p>
        </div>

        <div className="space-y-8">
          <StepCard
            number="1"
            title="Sign up and name your AI"
            description="Pick a name, set the vibe. Your AI starts learning about you from the first message."
          />
          <StepCard
            number="2"
            title="Share a few links"
            description="Drop links to your website, social profiles, or portfolio. Your AI reads them and instantly understands your world."
          />
          <StepCard
            number="3"
            title="Start talking"
            description="Chat, brainstorm, create content. The more you use it, the better it gets at being useful to you specifically."
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 py-24 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-3xl sm:text-4xl font-light text-continuum-text tracking-wide mb-4">
            Ready to begin?
          </h2>
          <p className="text-continuum-muted text-sm sm:text-base mb-8">
            Free to chat. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-block px-10 py-4 rounded-full text-base tracking-wider text-white/90 bg-continuum-accent/25 border border-continuum-accent/40 hover:bg-continuum-accent/35 hover:border-continuum-accent/60 transition-all duration-500 backdrop-blur-sm"
          >
            Create Your AI
          </Link>
        </div>

        <p className="text-continuum-muted/30 text-xs tracking-widest pt-16 font-light">
          one presence &middot; one continuity
        </p>
      </section>
    </main>
  )
}
