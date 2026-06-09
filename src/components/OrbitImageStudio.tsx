'use client'

import { useState } from 'react'

// ============================================
// ORBIT IMAGE STUDIO -- the simple image page
// Pick a girl -> pick one of her photos -> pick a day -> Recreate.
// Her face is swapped onto the photo and lands on that day's post.
// ============================================

interface Char { id: string; name: string }
interface Post {
  id: string
  characterId: string
  characterName: string
  content: string
  scheduledFor?: string
  imageUrl?: string | null
  dayLabel?: string
}
interface Scene { path: string; url: string }
interface Props {
  projectId: string
  characters: Char[]
  posts: Post[]
  onChange?: () => void
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayStr(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

export default function OrbitImageStudio({ projectId, characters, posts, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [charId, setCharId] = useState<string | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [loadingScenes, setLoadingScenes] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)
  const [busyPostId, setBusyPostId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const char = characters.find((c) => c.id === charId) || null
  const charPosts = posts
    .filter((p) => p.characterId === charId)
    .sort((a, b) => (a.scheduledFor || '').localeCompare(b.scheduledFor || ''))

  async function loadScenes(id: string) {
    setLoadingScenes(true)
    setError('')
    try {
      const r = await fetch('/api/orbit/scene-image?characterId=' + encodeURIComponent(id))
      const d = await r.json()
      setScenes(d.scenes || [])
    } catch {
      setError('Could not load photos')
    }
    setLoadingScenes(false)
  }

  function pickChar(id: string) {
    setCharId(id)
    setSelectedScene(null)
    setScenes([])
    loadScenes(id)
  }

  async function handleFiles(files: FileList) {
    if (!charId) return
    setUploading(true)
    setError('')
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append('characterId', charId)
        fd.append('file', file)
        const r = await fetch('/api/orbit/scene-image', { method: 'POST', body: fd })
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          setError(d.error || 'Upload failed')
        }
      } catch {
        setError('Upload failed')
      }
    }
    await loadScenes(charId)
    setUploading(false)
  }

  async function recreate(postId: string) {
    if (!selectedScene) return
    setBusyPostId(postId)
    setError('')
    try {
      const r = await fetch('/api/orbit/recreate-post-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, postId, baseImagePath: selectedScene.path }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Could not make the photo')
      } else if (onChange) {
        onChange()
      }
    } catch {
      setError('Could not make the photo')
    }
    setBusyPostId(null)
  }

  // Collapsed: a single big entry button.
  if (!open) {
    return (
      <div style={{ marginTop: '20px' }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontSize: '16px', fontWeight: 700,
          }}
        >
          ✨ Image Studio - make photos
        </button>
      </div>
    )
  }

  const stepLabel: React.CSSProperties = { fontSize: '13px', fontWeight: 700, color: '#a1a1aa', margin: '18px 0 8px' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0a0a0f', overflowY: 'auto', padding: '16px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', position: 'sticky', top: 0, background: '#0a0a0f', paddingBottom: '8px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#e4e4e7', margin: 0 }}>✨ Image Studio</h2>
        <button onClick={() => setOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', background: '#1e1e2e', border: '1px solid #2e2e3e', color: '#e4e4e7', fontSize: '14px', cursor: 'pointer' }}>Close</button>
      </div>

      {error && (
        <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
      )}

      {/* Step 1 */}
      <div style={stepLabel}>1. Pick a girl</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
        {characters.map((c) => (
          <button key={c.id} onClick={() => pickChar(c.id)}
            style={{
              padding: '18px', borderRadius: '12px', fontSize: '16px', fontWeight: 700, cursor: 'pointer',
              border: charId === c.id ? '2px solid #8b5cf6' : '1px solid #2e2e3e',
              background: charId === c.id ? 'rgba(139,92,246,0.18)' : '#14141f', color: '#e4e4e7',
            }}>
            {c.name}
          </button>
        ))}
      </div>

      {char && (
        <>
          {/* Step 2 */}
          <div style={stepLabel}>2. {char.name}&apos;s photos - tap one to use it</div>
          <label style={{
            display: 'inline-block', padding: '10px 16px', borderRadius: '10px', marginBottom: '12px',
            background: '#8b5cf6', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}>
            {uploading ? 'Uploading...' : '+ Add photos'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files && e.target.files.length) handleFiles(e.target.files) }} />
          </label>
          <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '10px' }}>Use only photos you have permission to use.</div>

          {loadingScenes ? (
            <div style={{ color: '#71717a', fontSize: '13px' }}>Loading photos...</div>
          ) : scenes.length === 0 ? (
            <div style={{ color: '#71717a', fontSize: '13px' }}>No photos yet - tap "Add photos" to drop some in.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
              {scenes.map((s) => (
                <button key={s.path} onClick={() => setSelectedScene(s)}
                  style={{
                    padding: 0, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', aspectRatio: '3/4',
                    border: selectedScene?.path === s.path ? '3px solid #8b5cf6' : '1px solid #2e2e3e', background: '#14141f',
                  }}>
                  <img src={s.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}

          {/* Step 3 */}
          {selectedScene && (
            <>
              <div style={stepLabel}>3. Put it on which day?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {charPosts.map((p) => (
                  <button key={p.id} onClick={() => recreate(p.id)} disabled={busyPostId !== null}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', cursor: busyPostId !== null ? 'default' : 'pointer',
                      padding: '8px 10px', borderRadius: '10px', border: '1px solid #2e2e3e', background: '#14141f', color: '#e4e4e7',
                    }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" style={{ width: '40px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: '40px', height: '52px', borderRadius: '6px', background: '#0f0f17', border: '1px dashed #3f3f46', flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 700 }}>{dayStr(p.scheduledFor)}</span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.content.slice(0, 50)}</span>
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: busyPostId === p.id ? '#c4b5fd' : '#8b5cf6', flexShrink: 0 }}>
                      {busyPostId === p.id ? 'Making...' : p.imageUrl ? 'Redo' : 'Make'}
                    </span>
                  </button>
                ))}
                {charPosts.length === 0 && <div style={{ color: '#71717a', fontSize: '13px' }}>No posts for {char.name} yet.</div>}
              </div>
              <div style={{ fontSize: '11px', color: '#71717a', marginTop: '8px' }}>Each photo takes about 30-60 seconds to make.</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
