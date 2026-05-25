'use client'

import React, { useState } from 'react'
import type { PhotoCandidate } from '@/lib/photo-search'
import type { ContentIdea } from '@/lib/content-idea-engine'

// Props for the PhotoApproval component
interface PhotoApprovalProps {
  idea: ContentIdea
  candidates: PhotoCandidate[]
  onApprove: (candidate: PhotoCandidate) => void
  onReject: (candidate: PhotoCandidate) => void
  onRefineSearch: (query: string) => void
  onSkipIdea: () => void
  currentIdeaIndex: number
  totalIdeas: number
}

// Mobile-first photo approval — one photo at a time
export default function PhotoApproval({
  idea,
  candidates,
  onApprove,
  onReject,
  onRefineSearch,
  onSkipIdea,
  currentIdeaIndex,
  totalIdeas,
}: PhotoApprovalProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [showRefine, setShowRefine] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [imageError, setImageError] = useState(false)

  const currentPhoto = candidates[currentPhotoIndex]
  const hasMore = currentPhotoIndex < candidates.length - 1
  const progress = candidates.length > 0
    ? Math.round(((currentPhotoIndex + 1) / candidates.length) * 100)
    : 0

  const handleApprove = () => {
    if (!currentPhoto) return
    onApprove(currentPhoto)
  }

  const handleReject = () => {
    if (!currentPhoto) return
    onReject(currentPhoto)
    if (hasMore) {
      setCurrentPhotoIndex(prev => prev + 1)
      setImageError(false)
    }
  }

  const handleRefine = () => {
    if (refineText.trim()) {
      onRefineSearch(refineText.trim())
      setRefineText('')
      setShowRefine(false)
      setCurrentPhotoIndex(0)
      setImageError(false)
    }
  }

  // No candidates found
  if (candidates.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📷</div>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>
          No photos found
        </h3>
        <p style={{ margin: '0 0 20px', color: '#888', fontSize: '14px' }}>
          Try refining the search for "{idea.title}"
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowRefine(true)}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              border: 'none',
              background: '#7c3aed',
              color: 'white',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Refine Search
          </button>
          <button
            onClick={onSkipIdea}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              border: '1px solid #333',
              background: 'transparent',
              color: '#ccc',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxWidth: '500px',
      margin: '0 auto',
      padding: '12px',
    }}>
      {/* Header: idea info + progress */}
      <div style={{
        padding: '12px 0',
        borderBottom: '1px solid #222',
        marginBottom: '12px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Idea {currentIdeaIndex + 1}/{totalIdeas}
          </span>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Photo {currentPhotoIndex + 1}/{candidates.length}
          </span>
        </div>
        <h3 style={{
          margin: '0 0 4px',
          fontSize: '16px',
          fontWeight: 600,
          color: '#fff',
        }}>
          {idea.title}
        </h3>
        <p style={{
          margin: 0,
          fontSize: '13px',
          color: '#aaa',
          lineHeight: '1.4',
        }}>
          {idea.caption.length > 100 ? idea.caption.slice(0, 100) + '...' : idea.caption}
        </p>
        {/* Progress bar */}
        <div style={{
          height: '3px',
          background: '#222',
          borderRadius: '2px',
          marginTop: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: progress + '%',
            background: '#7c3aed',
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Photo display */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        minHeight: '300px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#111',
        marginBottom: '12px',
      }}>
        {currentPhoto && !imageError ? (
          <img
            src={currentPhoto.imageUrl}
            alt={idea.title}
            onError={() => setImageError(true)}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: '16px',
            }}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: '#666',
          }}>
            <span style={{ fontSize: '36px' }}>⚠️</span>
            <span style={{ marginTop: '8px', fontSize: '14px' }}>Image failed to load</span>
            {hasMore && (
              <button
                onClick={handleReject}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #333',
                  background: 'transparent',
                  color: '#aaa',
                  cursor: 'pointer',
                }}
              >
                Next photo →
              </button>
            )}
          </div>
        )}

        {/* Mood badge */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'rgba(0,0,0,0.7)',
          padding: '4px 10px',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#ccc',
        }}>
          {idea.mood}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '8px 0 16px',
      }}>
        {/* Reject */}
        <button
          onClick={handleReject}
          style={{
            flex: 1,
            padding: '16px',
            borderRadius: '16px',
            border: '2px solid #ef4444',
            background: 'rgba(239,68,68,0.1)',
            color: '#ef4444',
            fontSize: '18px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          ✕ Reject
        </button>

        {/* Approve */}
        <button
          onClick={handleApprove}
          style={{
            flex: 1,
            padding: '16px',
            borderRadius: '16px',
            border: 'none',
            background: '#22c55e',
            color: 'white',
            fontSize: '18px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          ✓ Use This
        </button>
      </div>

      {/* Secondary actions */}
      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
      }}>
        <button
          onClick={() => setShowRefine(!showRefine)}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: '1px solid #333',
            background: 'transparent',
            color: '#aaa',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          🔍 Refine Search
        </button>
        <button
          onClick={onSkipIdea}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            border: '1px solid #333',
            background: 'transparent',
            color: '#aaa',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          ⏭ Skip Idea
        </button>
      </div>

      {/* Refine search input */}
      {showRefine && (
        <div style={{
          marginTop: '12px',
          display: 'flex',
          gap: '8px',
        }}>
          <input
            type="text"
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
            placeholder="Add keywords (e.g. outdoor, close-up)"
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid #333',
              background: '#111',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleRefine}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#7c3aed',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Go
          </button>
        </div>
      )}
    </div>
  )
}
