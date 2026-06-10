'use client'

import { useState } from 'react'

// ============================================
// ORBIT IMAGE STUDIO -- the simple image page
// Pick a girl -> open the inspiration photo bucket (a folder per model)
// -> pick an inspiration photo -> pick a day -> Make.
// A fresh photo of the girl is generated copying the inspiration photo's vibe.
// ============================================

interface Char { id: string; name: string; face?: string | null }
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
  const [bucketOpen, setBucketOpen] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)

  const char = characters.find((c) => c.id === charId) || null
  const folder = characters.find((c) => c.id === folderId) || null
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

  function openFolder(id: string) {
    setFolderId(id)
    setCharId(id)
    setSelectedScene(null)
    setScenes([])
    loadScenes(id)
  }

  function pickGirl(id: string) {
    setBucketOpen(true)
    openFolder(id)
  }

  function closeBucket() {
    setBucketOpen(false)
    setFolderId(null)
  }

  async function handleFiles(files: FileList) {
    const target = folderId || charId
    if (!target) return
    setUploading(true)
    setError('')
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append('characterId', target)
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
    await loadScenes(target)
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
  const note: React.CSSProperties = { fontSize: '11px', color: '#71717a', marginBottom: '10px' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0a0a0f', overflowY: 'auto', padding: '16px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', position: 'sticky', top: 0, background: '#0a0a0f', paddingBottom: '8px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#e4e4e7', margin: 0 }}>✨ Image Studio</h2>
        <button onClick={() => setOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', background: '#1e1e2e', border: '1px solid #2e2e3e', color: '#e4e4e7', fontSize: '14px', cursor: 'pointer' }}>Close</button>
      </div>

      {error && (
        <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
      )}

      {/* Step 1 -- pick a girl (her headshot is the main photo). */}
      <div style={stepLabel}>1. Pick a girl</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
        {characters.map((c) => (
          <button key={c.id} onClick={() => pickGirl(c.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              padding: '12px', borderRadius: '12px', cursor: 'pointer',
              border: charId === c.id ? '2px solid #8b5cf6' : '1px solid #2e2e3e',
              background: charId === c.id ? 'rgba(139,92,246,0.18)' : '#14141f', color: '#e4e4e7',
            }}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>{c.name}</span>
            {c.face ? (
              <img src={c.face} alt={c.name}
                style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '10px', display: 'block' }} />
            ) : (
              <span style={{
                width: '100%', aspectRatio: '1 / 1', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0f0f17', border: '1px dashed #3f3f46', fontSize: '11px', color: '#71717a',
              }}>No headshot yet</span>
            )}
          </button>
        ))}
      </div>

      {/* Inspiration photo bucket -- a folder for each model. */}
      <button onClick={() => { setBucketOpen(true); setFolderId(null) }}
        style={{
          width: '100%', marginTop: '18px', padding: '14px', borderRadius: '12px', cursor: 'pointer',
          background: '#1e1e2e', border: '1px solid #2e2e3e', color: '#e4e4e7', fontSize: '15px', fontWeight: 700,
        }}>
        📁 Inspiration photo bucket
      </button>

      {bucketOpen && (
        <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', background: '#101018', border: '1px solid #2e2e3e' }}>
          {folderId === null ? (
            <>
              <div style={stepLabel}>Pick a model&apos;s folder</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                {characters.map((c) => (
                  <button key={c.id} onClick={() => openFolder(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '16px', borderRadius: '12px', cursor: 'pointer',
                      background: '#14141f', border: '1px solid #2e2e3e', color: '#e4e4e7', fontSize: '16px', fontWeight: 700, textAlign: 'left',
                    }}>
                    <span style={{ fontSize: '22px' }}>📁</span>{c.name}
                  </button>
                ))}
              </div>
              <button onClick={closeBucket}
                style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '10px', background: 'transparent', border: '1px solid #2e2e3e', color: '#a1a1aa', fontSize: '13px', cursor: 'pointer' }}>
                Close bucket
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setFolderId(null)}
                style={{ padding: '6px 12px', borderRadius: '8px', background: '#1e1e2e', border: '1px solid #2e2e3e', color: '#e4e4e7', fontSize: '13px', cursor: 'pointer', marginBottom: '10px' }}>
                &larr; All folders
              </button>
              <div style={stepLabel}>{folder?.name}&apos;s inspiration photos</div>
              <label style={{
                display: 'inline-block', padding: '10px 16px', borderRadius: '10px', marginBottom: '10px',
                background: '#8b5cf6', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}>
                {uploading ? 'Uploading...' : '+ Add photo'}
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files && e.target.files.length) handleFiles(e.target.files) }} />
              </label>
              <div style={note}>These are the photos you picked for {folder?.name}. Tap one to use it. Use only photos you have permission to use.</div>

              {loadingScenes ? (
                <div style={{ color: '#71717a', fontSize: '13px' }}>Loading photos...</div>
              ) : scenes.length === 0 ? (
                <div style={{ color: '#71717a', fontSize: '13px' }}>No photos in this folder yet - tap "+ Add photo" to drop some in.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {scenes.map((s) => (
                    <button key={s.path} onClick={() => { setSelectedScene(s); setBucketOpen(false) }}
                      style={{
                        padding: 0, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', aspectRatio: '3/4',
                        border: selectedScene?.path === s.path ? '3px solid #8b5cf6' : '1px solid #2e2e3e', background: '#14141f',
                      }}>
                      <img src={s.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 3 -- choose the day this lands on. */}
      {!bucketOpen && selectedScene && char && (
        <>
          <div style={stepLabel}>Put {char.name} on which day?</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <img src={selectedScene.url} alt="" style={{ width: '46px', height: '60px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Using this inspiration photo. <button onClick={() => { setBucketOpen(true); setFolderId(charId) }} style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Change</button></span>
          </div>
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
    </div>
  )
}
