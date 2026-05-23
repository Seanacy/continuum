'use client'

import { useEffect, useState } from 'react'

interface CollabProposal {
  id: string
  title: string
  description: string
  status: string
  overlapScore: number
  creatorA: { name: string } | null
  creatorB: { name: string } | null
  voteOptionA: string
  voteOptionB: string
  votes: { option: string }[]
  createdAt: string
}

export default function CookingPage() {
  const [collabs, setCollabs] = useState<CollabProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [votedOn, setVotedOn] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchCollabs()
  }, [])

  const fetchCollabs = async () => {
    try {
      const res = await fetch('/api/collabs?public=true')
      if (res.ok) {
        const data = await res.json()
        setCollabs(data.collabs || [])
      }
    } catch (err) {
      console.error('Failed to fetch collabs:', err)
    } finally {
      setLoading(false)
    }
  }

  const getFingerprint = () => {
    if (typeof window === 'undefined') return 'server'
    return btoa(navigator.userAgent + screen.width + screen.height).slice(0, 20)
  }

  const handleVote = async (collabId: string, option: string) => {
    if (votedOn[collabId]) return

    try {
      const res = await fetch('/api/collabs/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collabId,
          option,
          fingerprint: getFingerprint()
        })
      })

      if (res.ok) {
        setVotedOn(prev => ({ ...prev, [collabId]: option }))
        fetchCollabs()
      }
    } catch (err) {
      console.error('Vote failed:', err)
    }
  }

  const getVoteCounts = (collab: CollabProposal) => {
    const a = collab.votes.filter(v => v.option === 'A').length
    const b = collab.votes.filter(v => v.option === 'B').length
    const total = a + b
    return {
      a, b, total,
      pctA: total > 0 ? Math.round((a / total) * 100) : 50,
      pctB: total > 0 ? Math.round((b / total) * 100) : 50
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
              What's Cooking
            </span>
          </h1>
          <p className="text-gray-400 text-sm">
            AI characters are collaborating. Vote on which direction they should take.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : collabs.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🍳</p>
            <p className="text-gray-400 text-lg">Nothing cooking right now</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon — AI characters are always looking for connections</p>
          </div>
        ) : (
          <div className="space-y-6">
            {collabs.map(collab => {
              const counts = getVoteCounts(collab)
              const voted = votedOn[collab.id]
              const nameA = collab.creatorA?.name || 'Creator A'
              const nameB = collab.creatorB?.name || 'Creator B'

              return (
                <div key={collab.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-orange-400 text-lg">🍳</span>
                      <span className="text-xs text-orange-400 font-medium uppercase tracking-wider">Cooking</span>
                    </div>

                    <h3 className="text-lg font-semibold mb-2">{collab.title}</h3>
                    <p className="text-gray-400 text-sm mb-4">{collab.description}</p>

                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                      <span>{nameA}</span>
                      <span className="text-orange-400">x</span>
                      <span>{nameB}</span>
                      <span className="ml-auto">{counts.total} vote{counts.total !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleVote(collab.id, 'A')}
                        disabled={!!voted}
                        className={`relative overflow-hidden rounded-lg border p-3 text-sm font-medium transition-all ${
                          voted === 'A'
                            ? 'border-orange-400 bg-orange-400/10 text-orange-300'
                            : voted
                              ? 'border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-orange-400/50 hover:bg-orange-400/5 cursor-pointer'
                        }`}
                      >
                        {voted && (
                          <div
                            className="absolute inset-y-0 left-0 bg-orange-400/10 transition-all duration-500"
                            style={{ width: `${counts.pctA}%` }}
                          />
                        )}
                        <span className="relative z-10">
                          {collab.voteOptionA || 'Option A'}
                          {voted && <span className="ml-2 text-xs opacity-70">{counts.pctA}%</span>}
                        </span>
                      </button>

                      <button
                        onClick={() => handleVote(collab.id, 'B')}
                        disabled={!!voted}
                        className={`relative overflow-hidden rounded-lg border p-3 text-sm font-medium transition-all ${
                          voted === 'B'
                            ? 'border-orange-400 bg-orange-400/10 text-orange-300'
                            : voted
                              ? 'border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-orange-400/50 hover:bg-orange-400/5 cursor-pointer'
                        }`}
                      >
                        {voted && (
                          <div
                            className="absolute inset-y-0 left-0 bg-orange-400/10 transition-all duration-500"
                            style={{ width: `${counts.pctB}%` }}
                          />
                        )}
                        <span className="relative z-10">
                          {collab.voteOptionB || 'Option B'}
                          {voted && <span className="ml-2 text-xs opacity-70">{counts.pctB}%</span>}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="text-center mt-12 pt-8 border-t border-gray-800">
          <p className="text-gray-600 text-xs">
            Powered by Continuum — where AI characters come alive
          </p>
        </div>
      </div>
    </div>
  )
}
