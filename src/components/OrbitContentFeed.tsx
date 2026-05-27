'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ============================================
// TYPES
// ============================================
interface OrbitPostItem {
  id: string;
  projectId: string;
  characterId: string;
  content: string;
  contentType: string;
  platform: string;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  character: { id: string; name: string; roleType: string; username: string };
}

interface ContentFeedProps {
  projectId: string;
  characters: { id: string; name: string; roleType: string; username: string }[];
}

// ============================================
// CONSTANTS
// ============================================
const STATUS_COLORS: Record<string, string> = {
  draft: '#71717a',
  scheduled: '#3b82f6',
  pending_approval: '#f59e0b',
  approved: '#22c55e',
  published: '#8b5cf6',
  rejected: '#ef4444'
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  pending_approval: 'Pending',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected'
};

const PLATFORM_ICONS: Record<string, string> = {
  twitter: 'X',
  instagram: 'IG',
  tiktok: 'TT',
  youtube: 'YT',
  linkedin: 'LI'
};

// ============================================
// COMPONENT
// ============================================
export default function OrbitContentFeed({ projectId, characters }: ContentFeedProps) {
  const [posts, setPosts] = useState<OrbitPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // Filters
  const [filterCharacter, setFilterCharacter] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // ============================================
  // FETCH POSTS
  // ============================================
  const fetchPosts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filterCharacter) params.set('characterId', filterCharacter);
      if (filterPlatform) params.set('platform', filterPlatform);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/orbit/${projectId}/posts?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPosts(data.posts || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      setStats(data.stats || {});
    } catch (err) {
      console.error('Error fetching posts:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, filterCharacter, filterPlatform, filterStatus]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ============================================
  // BULK ACTIONS
  // ============================================
  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`/api/orbit/${projectId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, postIds: Array.from(selectedIds) })
      });
      if (!res.ok) throw new Error('Bulk action failed');
      setSelectedIds(new Set());
      fetchPosts(pagination.page);
    } catch (err) {
      console.error('Bulk action error:', err);
    }
  };

  // ============================================
  // SINGLE POST UPDATE
  // ============================================
  const updatePost = async (postId: string, updates: any) => {
    try {
      const res = await fetch(`/api/orbit/${projectId}/posts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, ...updates })
      });
      if (!res.ok) throw new Error('Update failed');
      fetchPosts(pagination.page);
    } catch (err) {
      console.error('Update error:', err);
    }
  };

  const saveEdit = async (postId: string) => {
    await updatePost(postId, { content: editContent });
    setEditingId(null);
    setEditContent('');
  };

  const startEdit = (post: OrbitPostItem) => {
    setEditingId(post.id);
    setEditContent(post.content);
  };

  // ============================================
  // SELECTION
  // ============================================
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map(p => p.id)));
    }
  };

  // ============================================
  // RENDER
  // ============================================
  const totalPosts = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header Stats */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          background: '#14141f', border: '1px solid #1e1e2e', borderRadius: '0.5rem',
          padding: '0.75rem 1rem', minWidth: '80px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e4e4e7' }}>{totalPosts}</div>
          <div style={{ fontSize: '0.7rem', color: '#71717a' }}>Total</div>
        </div>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} style={{
            background: filterStatus === key ? '#1e1e2e' : '#14141f',
            border: `1px solid ${filterStatus === key ? STATUS_COLORS[key] : '#1e1e2e'}`,
            borderRadius: '0.5rem', padding: '0.75rem 1rem', minWidth: '80px',
            textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s'
          }} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: STATUS_COLORS[key] }}>{stats[key] || 0}</div>
            <div style={{ fontSize: '0.7rem', color: '#71717a' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterCharacter}
          onChange={e => setFilterCharacter(e.target.value)}
          style={{
            background: '#14141f', border: '1px solid #1e1e2e', borderRadius: '0.375rem',
            color: '#e4e4e7', padding: '0.5rem', fontSize: '0.8rem'
          }}
        >
          <option value="">All Characters</option>
          {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
          style={{
            background: '#14141f', border: '1px solid #1e1e2e', borderRadius: '0.375rem',
            color: '#e4e4e7', padding: '0.5rem', fontSize: '0.8rem'
          }}
        >
          <option value="">All Platforms</option>
          <option value="twitter">Twitter/X</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="linkedin">LinkedIn</option>
        </select>

        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
            <span style={{ color: '#71717a', fontSize: '0.8rem', alignSelf: 'center' }}>
              {selectedIds.size} selected
            </span>
            <button onClick={() => handleBulkAction('approve')} style={{
              background: '#22c55e20', border: '1px solid #22c55e', borderRadius: '0.375rem',
              color: '#22c55e', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer'
            }}>Approve</button>
            <button onClick={() => handleBulkAction('reject')} style={{
              background: '#ef444420', border: '1px solid #ef4444', borderRadius: '0.375rem',
              color: '#ef4444', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer'
            }}>Reject</button>
            <button onClick={() => handleBulkAction('publish')} style={{
              background: '#8b5cf620', border: '1px solid #8b5cf6', borderRadius: '0.375rem',
              color: '#8b5cf6', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer'
            }}>Publish</button>
            <button onClick={() => handleBulkAction('delete')} style={{
              background: '#ef444420', border: '1px solid #ef4444', borderRadius: '0.375rem',
              color: '#ef4444', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer'
            }}>Delete</button>
          </div>
        )}
      </div>

      {/* Select All Checkbox */}
      {posts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input
            type="checkbox"
            checked={selectedIds.size === posts.length && posts.length > 0}
            onChange={selectAll}
            style={{ accentColor: '#8b5cf6' }}
          />
          <span style={{ color: '#71717a', fontSize: '0.75rem' }}>Select all on this page</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#71717a' }}>
          Loading posts...
        </div>
      )}

      {/* Empty State */}
      {!loading && posts.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '3rem', color: '#71717a',
          background: '#14141f', border: '1px solid #1e1e2e', borderRadius: '0.75rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>No posts yet</div>
          <div style={{ fontSize: '0.85rem' }}>
            Use the Automation panel to generate content for your characters.
          </div>
        </div>
      )}

      {/* Posts List */}
      {!loading && posts.map(post => (
        <div key={post.id} style={{
          background: selectedIds.has(post.id) ? '#1e1e2e' : '#14141f',
          border: `1px solid ${selectedIds.has(post.id) ? '#8b5cf6' : '#1e1e2e'}`,
          borderRadius: '0.75rem', padding: '1rem', marginBottom: '0.75rem',
          transition: 'all 0.2s'
        }}>
          {/* Post Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={selectedIds.has(post.id)}
              onChange={() => toggleSelect(post.id)}
              style={{ accentColor: '#8b5cf6' }}
            />
            <div style={{
              background: '#8b5cf620', color: '#8b5cf6', padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 600
            }}>
              {post.character.name}
            </div>
            <div style={{
              background: '#3b82f620', color: '#3b82f6', padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 600
            }}>
              {PLATFORM_ICONS[post.platform] || post.platform}
            </div>
            <div style={{
              background: '#6d28d920', color: '#a78bfa', padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem', fontSize: '0.7rem'
            }}>
              {post.contentType}
            </div>
            <div style={{
              background: `${STATUS_COLORS[post.status]}20`,
              color: STATUS_COLORS[post.status],
              padding: '0.25rem 0.5rem', borderRadius: '0.25rem',
              fontSize: '0.7rem', fontWeight: 600
            }}>
              {STATUS_LABELS[post.status] || post.status}
            </div>
            <div style={{ marginLeft: 'auto', color: '#71717a', fontSize: '0.7rem' }}>
              {new Date(post.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Post Content */}
          {editingId === post.id ? (
            <div style={{ marginBottom: '0.75rem' }}>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                style={{
                  width: '100%', minHeight: '100px', background: '#0a0a0f',
                  border: '1px solid #8b5cf6', borderRadius: '0.375rem',
                  color: '#e4e4e7', padding: '0.75rem', fontSize: '0.85rem',
                  resize: 'vertical', fontFamily: 'inherit'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => saveEdit(post.id)} style={{
                  background: '#8b5cf6', border: 'none', borderRadius: '0.375rem',
                  color: 'white', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer'
                }}>Save</button>
                <button onClick={() => setEditingId(null)} style={{
                  background: 'transparent', border: '1px solid #1e1e2e', borderRadius: '0.375rem',
                  color: '#71717a', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer'
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{
              color: '#e4e4e7', fontSize: '0.85rem', lineHeight: 1.5,
              marginBottom: '0.75rem', whiteSpace: 'pre-wrap',
              maxHeight: '120px', overflow: 'hidden'
            }}>
              {post.content}
            </div>
          )}

          {/* Post Actions */}
          {editingId !== post.id && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => startEdit(post)} style={{
                background: 'transparent', border: '1px solid #1e1e2e', borderRadius: '0.375rem',
                color: '#71717a', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer'
              }}>Edit</button>

              {post.status !== 'approved' && post.status !== 'published' && (
                <button onClick={() => updatePost(post.id, { status: 'approved' })} style={{
                  background: 'transparent', border: '1px solid #22c55e', borderRadius: '0.375rem',
                  color: '#22c55e', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer'
                }}>Approve</button>
              )}

              {post.status !== 'published' && (
                <button onClick={() => updatePost(post.id, { status: 'published' })} style={{
                  background: 'transparent', border: '1px solid #8b5cf6', borderRadius: '0.375rem',
                  color: '#8b5cf6', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer'
                }}>Publish</button>
              )}

              {post.status !== 'rejected' && post.status !== 'published' && (
                <button onClick={() => updatePost(post.id, { status: 'rejected' })} style={{
                  background: 'transparent', border: '1px solid #ef4444', borderRadius: '0.375rem',
                  color: '#ef4444', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer'
                }}>Reject</button>
              )}

              {post.status === 'rejected' && (
                <button onClick={() => updatePost(post.id, { status: 'draft' })} style={{
                  background: 'transparent', border: '1px solid #71717a', borderRadius: '0.375rem',
                  color: '#71717a', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer'
                }}>Reset to Draft</button>
              )}

              {post.scheduledFor && (
                <span style={{ color: '#3b82f6', fontSize: '0.7rem', alignSelf: 'center', marginLeft: 'auto' }}>
                  Scheduled: {new Date(post.scheduledFor).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            onClick={() => fetchPosts(pagination.page - 1)}
            disabled={pagination.page <= 1}
            style={{
              background: '#14141f', border: '1px solid #1e1e2e', borderRadius: '0.375rem',
              color: pagination.page <= 1 ? '#333' : '#e4e4e7', padding: '0.5rem 1rem',
              fontSize: '0.8rem', cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer'
            }}
          >Prev</button>
          <span style={{ color: '#71717a', fontSize: '0.8rem', alignSelf: 'center' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => fetchPosts(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            style={{
              background: '#14141f', border: '1px solid #1e1e2e', borderRadius: '0.375rem',
              color: pagination.page >= pagination.totalPages ? '#333' : '#e4e4e7',
              padding: '0.5rem 1rem', fontSize: '0.8rem',
              cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer'
            }}
          >Next</button>
        </div>
      )}
    </div>
  );
}
