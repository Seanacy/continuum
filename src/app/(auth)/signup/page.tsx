'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [aiName, setAiName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, aiName }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        return
      }

      router.push('/home')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Create your Continuum</h1>
          <p className="text-continuum-muted text-sm">
            Name your AI — this is who you'll talk to every day
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Name your AI"
            value={aiName}
            onChange={(e) => setAiName(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-continuum-surface border border-continuum-border focus:border-continuum-accent outline-none transition text-center text-lg"
            maxLength={30}
            required
          />
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-continuum-surface border border-continuum-border focus:border-continuum-accent outline-none transition"
            required
          />
          <input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-continuum-surface border border-continuum-border focus:border-continuum-accent outline-none transition"
            minLength={8}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-continuum-accent hover:bg-continuum-accent-dim transition text-white font-medium disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Begin'}
        </button>

        <p className="text-center text-continuum-muted text-sm">
          Already have an account?{' '}
          <a href="/login" className="text-continuum-accent hover:underline">
            Log in
          </a>
        </p>
      </form>
    </main>
  )
}
