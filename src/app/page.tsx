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

    // Floating particles
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
      const cy = canvas.height / 2 - 40

      // Outer glow - large ambient
      const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300)
      outerGlow.addColorStop(0, 'rgba(139, 92, 246, 0.08)')
      outerGlow.addColorStop(0.5, 'rgba(139, 92, 246, 0.03)')
      outerGlow.addColorStop(1, 'rgba(139, 92, 246, 0)')
      ctx.fillStyle = outerGlow
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Breathing orb
      const breathe = Math.sin(time * 2) * 0.15 + 1
      const orbRadius = 60 * breathe

      // Orb outer ring glow
      const ringGlow = ctx.createRadialGradient(cx, cy, orbRadius * 0.8, cx, cy, orbRadius * 2.5)
      ringGlow.addColorStop(0, 'rgba(139, 92, 246, 0.12)')
      ringGlow.addColorStop(0.4, 'rgba(139, 92, 246, 0.05)')
      ringGlow.addColorStop(1, 'rgba(139, 92, 246, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = ringGlow
      ctx.fill()

      // Main orb
      const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbRadius)
      orbGrad.addColorStop(0, `rgba(139, 92, 246, ${0.35 + Math.sin(time * 3) * 0.1})`)
      orbGrad.addColorStop(0.6, `rgba(139, 92, 246, ${0.15 + Math.sin(time * 2) * 0.05})`)
      orbGrad.addColorStop(1, 'rgba(139, 92, 246, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius, 0, Math.PI * 2)
      ctx.fillStyle = orbGrad
      ctx.fill()

      // Inner bright core
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbRadius * 0.3)
      coreGrad.addColorStop(0, `rgba(200, 180, 255, ${0.4 + Math.sin(time * 4) * 0.1})`)
      coreGrad.addColorStop(1, 'rgba(139, 92, 246, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      // Particles
      particles.forEach((p) => {
        p.x += p.vx * p.speed
        p.y += p.vy * p.speed

        // Gentle drift toward center
        const dx = cx - p.x
        const dy = cy - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 350) {
          p.vx += dx * 0.00003
          p.vy += dy * 0.00003
        }

        // Wrap around
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        const particleOpacity = p.opacity * (0.7 + Math.sin(time * 3 + p.x * 0.01) * 0.3)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139, 92, 246, ${particleOpacity})`
        ctx.fill()

        // Draw faint lines to nearby particles
        particles.forEach((p2) => {
          const d = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2)
          if (d < 100 && d > 0) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.03 * (1 - d / 100)})`
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

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <OrbCanvas />

      {/* Content layer */}
      <div className="relative z-10 text-center space-y-8 px-6">
        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-5xl sm:text-6xl font-light tracking-widest text-continuum-text/90 uppercase">
            Continuum
          </h1>
          <div className="h-px w-16 mx-auto bg-gradient-to-r from-transparent via-continuum-accent/40 to-transparent" />
        </div>

        {/* Tagline */}
        <p className="text-continuum-muted text-sm sm:text-base tracking-wide font-light max-w-xs mx-auto leading-relaxed">
          Your AI is waiting.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6">
          <Link
            href="/login"
            className="px-8 py-3 rounded-full text-sm tracking-wider text-continuum-muted/80 border border-continuum-border/50 hover:border-continuum-accent/40 hover:text-continuum-text transition-all duration-500 backdrop-blur-sm"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-8 py-3 rounded-full text-sm tracking-wider text-white/90 bg-continuum-accent/20 border border-continuum-accent/30 hover:bg-continuum-accent/30 hover:border-continuum-accent/50 transition-all duration-500 backdrop-blur-sm"
          >
            Begin
          </Link>
        </div>

        {/* Subtle bottom text */}
        <p className="text-continuum-muted/30 text-xs tracking-widest pt-12 font-light">
          one presence &middot; one continuity
        </p>
      </div>
    </main>
  )
}
