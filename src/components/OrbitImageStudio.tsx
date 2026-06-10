'use client'

import { useState } from 'react'

// ============================================
// ORBIT IMAGE STUDIO -- the simple image page
// Pick a girl -> see her content ideas (same ones as the calendar, in date order)
// -> tap Make on an idea -> pick a friend photo (from her bucket or a fresh upload)
// -> a fresh photo of the girl is generated in that photo's vibe and lands on that day.
// The "inspiration photo bucket" (a folder per model) is just the photo stash.
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
  photoIdea?: string
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
  const [busyPostId, setBusyPostId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [bucketOpen, setBucketOpen] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [pickingFor, setPickingFor] = useState<string | null>(null)

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

  function pickGirl(id: string) {
    setCharId(id)
    setBucketOpen(false)
    setFolderId(null)
    setPickingFor(null)
    setScenes([])
    loadScenes(id)
  }

  function openBucket() {
    setBucketOpen(true)
    setFolderId(null)
    setPickingFor(null)
  }

  function openFolder(id: string) {
    setCharId(id)
    setFolderId(id)
    setScenes([])
    loadScenes(id)
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

  async function recreate(postId: string, baseImagePath: string) {
    setBusyPostId(postId)
    setError('')
    try {
      const r = await fetch('/api/orbit/recreate-post-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, postId, baseImagePath }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Could not make the photo')
      } else {
        setPickingFor(null)
        if (onChange) onChange()
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
    <div style={{ marginTop: '12px', background: '#0f0f17', borderRadius: '14px', padding: '14px', border: '1px solid #2e2e3e' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
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

      {/* Inspiration photo bucket -- a folder for each model (the photo stash). */}
      <button onClick={openBucket}
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
              <div style={note}>These are the photos you picked for {folder?.name}. Use only photos you have permission to use.</div>

              {loadingScenes ? (
                <div style={{ color: '#71717a', fontSize: '13px' }}>Loading photos...</div>
              ) : scenes.length === 0 ? (
                <div style={{ color: '#71717a', fontSize: '13px' }}>No photos in this folder yet - tap "+ Add photo" to drop some in.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {scenes.map((s) => (
                    <div key={s.path} style={{ borderRadius: '10px', overflow: 'hidden', aspectRatio: '3/4', border: '1px solid #2e2e3e', background: '#14141f' }}>
                      <img src={s.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Image ideas for the selected girl (same posts as the calendar, in date order). */}
      {!bucketOpen && char && (
        <>
          <div style={stepLabel}>Image ideas for {char.name}</div>
          <div style={note}>Tap "Make" on an idea, then pick a friend&apos;s photo. {char.name} gets recreated in that photo and it lands on that day&apos;s post.</div>
          {charPosts.length === 0 ? (
            <div style={{ color: '#71717a', fontSize: '13px' }}>No ideas for {char.name} yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charPosts.map((p) => (
                <div key={p.id} style={{ borderRadius: '12px', border: '1px solid #2e2e3e', background: '#14141f', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" style={{ width: '48px', height: '62px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: '48px', height: '62px', borderRadius: '8px', background: '#0f0f17', border: '1px dashed #3f3f46', flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e4e4e7' }}>{dayStr(p.scheduledFor)}</span>
                      <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: p.photoIdea ? '#c4b5fd' : '#52525b' }}>
                        {p.photoIdea ? '📸 ' + p.photoIdea : 'Photo idea: (we add this next)'}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#71717a', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.content.slice(0, 55)}</span>
                    </span>
                    <button onClick={() => setPickingFor(pickingFor === p.id ? null : p.id)} disabled={busyPostId !== null}
                      style={{
                        flexShrink: 0, padding: '8px 14px', borderRadius: '10px', border: 'none',
                        cursor: busyPostId !== null ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700,
                        background: busyPostId === p.id ? '#3f3f46' : '#8b5cf6', color: '#fff',
                      }}>
                      {busyPostId === p.id ? 'Making...' : p.imageUrl ? 'Redo' : 'Make'}
                    </button>
                  </div>

                  {pickingFor === p.id && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #2e2e3e' }}>
                      <div style={note}>Pick a photo from {char.name}&apos;s bucket, or upload a fresh one.</div>
                      <label style={{
                        display: 'inline-block', padding: '8px 14px', borderRadius: '10px', marginBottom: '10px',
                        background: '#1e1e2e', border: '1px solid #2e2e3e', color: '#e4e4e7', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                      }}>
                        {uploading ? 'Uploading...' : '+ Upload fresh'}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={(e) => { if (e.target.files && e.target.files.length) handleFiles(e.target.files) }} />
                      </label>
                      {loadingScenes ? (
                        <div style={{ color: '#71717a', fontSize: '13px' }}>Loading bucket...</div>
                      ) : scenes.length === 0 ? (
                        <div style={{ color: '#71717a', fontSize: '13px' }}>No photos in {char.name}&apos;s bucket yet - upload one above.</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                          {scenes.map((s) => (
                            <button key={s.path} onClick={() => recreate(p.id, s.path)} disabled={busyPostId !== null}
                              style={{
                                padding: 0, borderRadius: '10px', overflow: 'hidden', cursor: busyPostId !== null ? 'default' : 'pointer', aspectRatio: '3/4',
                                border: '1px solid #2e2e3e', background: '#14141f',
                              }}>
                              <img src={s.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setPickingFor(null)}
                        style={{ marginTop: '10px', padding: '6px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid #2e2e3e', color: '#a1a1aa', fontSize: '12px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#71717a', marginTop: '10px' }}>Each photo takes about 30-60 seconds to make.</div>
        </>
      )}
    </div>
  )
}
