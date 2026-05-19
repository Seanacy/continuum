'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface UserStat {
  id: string
  email: string
  name: string | null
  aiName: string | null
  tier: string
  createdAt: string
  todayMessages: number
  monthTokens: number
  lastActive: string
  _count: {
    messages: number
    memories: number
    threads: number
    discoveryAnswers: number
  }
}

interface PlatformStats {
  totalUsers: number
  freeUsers: number
  proUsers: number
  totalMessages: number
  todayMessages: number
  weekMessages: number
  monthTokens: number
  totalMemories: number
  totalThreads: number
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserStat[]>([])
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function fetchData() {
      try {
        const [usersRes, statsRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/admin/stats'),
        ])

        if (usersRes.status === 403 || statsRes.status === 403) {
          setError('Access denied. Admin only.')
          return
        }
        if (usersRes.status === 401 || statsRes.status === 401) {
          router.push('/login')
          return
        }

        const usersData = await usersRes.json()
        const statsData = await statsRes.json()
        setUsers(usersData.users)
        setStats(statsData)
      } catch {
        setError('Failed to load admin data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ opacity: 0.6 }}>Loading admin dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#f87171' }}>{error}</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', padding: '2rem' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          Admin Dashboard
        </h1>

        {/* Platform Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <StatCard label="Total Users" value={stats.totalUsers} />
            <StatCard label="Free" value={stats.freeUsers} />
            <StatCard label="Pro" value={stats.proUsers} />
            <StatCard label="Messages Today" value={stats.todayMessages} />
            <StatCard label="Messages (7d)" value={stats.weekMessages} />
            <StatCard label="Total Messages" value={stats.totalMessages} />
            <StatCard label="Month Tokens" value={formatNumber(stats.monthTokens)} />
            <StatCard label="Memories" value={stats.totalMemories} />
            <StatCard label="Threads" value={stats.totalThreads} />
          </div>
        )}

        {/* Users Table */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.75rem' }}>Users</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Messages</th>
                <th style={thStyle}>Today</th>
                <th style={thStyle}>Memories</th>
                <th style={thStyle}>Threads</th>
                <th style={thStyle}>Last Active</th>
                <th style={thStyle}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #1a1a2e' }}>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.name || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      background: u.tier === 'pro' ? '#7c3aed33' : '#333',
                      color: u.tier === 'pro' ? '#a78bfa' : '#999',
                    }}>
                      {u.tier}
                    </span>
                  </td>
                  <td style={tdStyle}>{u._count.messages}</td>
                  <td style={tdStyle}>{u.todayMessages}</td>
                  <td style={tdStyle}>{u._count.memories}</td>
                  <td style={tdStyle}>{u._count.threads}</td>
                  <td style={tdStyle}>{timeAgo(u.lastActive)}</td>
                  <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      background: '#12121f',
      borderRadius: 8,
      padding: '1rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px', color: '#888', fontWeight: 500 }
const tdStyle: React.CSSProperties = { padding: '8px', color: '#ccc' }

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
