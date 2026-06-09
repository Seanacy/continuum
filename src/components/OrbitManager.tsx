'use client'

import { useState, useEffect } from 'react'
import OrbitAutomationPanel from '@/components/OrbitAutomationPanel'
import OrbitContentFeed from '@/components/OrbitContentFeed'
import OrbitCampaignManager from '@/components/OrbitCampaignManager'
import OrbitAnalyticsDashboard from '@/components/OrbitAnalyticsDashboard'
import OrbitCalendar from '@/components/OrbitCalendar'
  import OrbitPostingPlan from '@/components/OrbitPostingPlan'
import OrbitImageStudio from '@/components/OrbitImageStudio'

// ============================================
// TYPES
// ============================================

interface OrbitProject {
  id: string
  name: string
  description: string
  websiteUrl: string | null
  targetAudience: string | null
  objective: string
  characterCount: number
  status: string
  createdAt: string
  characters: {
    id: string
    name: string
    roleType: string
    username: string
    isActive: boolean
  }[]
}

interface OrbitProjectDetail extends OrbitProject {
  industry: string | null
  strategyTable: any[] | null
  totalCostCents: number
  characters: {
    id: string
    name: string
    roleType: string
    username: string
    isActive: boolean
    contentAngle: string
    goal: string
    imagePrompt: string
    appearance: any
    personality: any
    behavior: any
    contentProfile: any
    relationshipsAsA: any[]
    relationshipsAsB: any[]
  }[]
}

type OrbitView = 'list' | 'create' | 'detail'

const OBJECTIVES = [
  { value: 'brand_awareness', label: 'Brand Awareness', desc: 'Get your name out there' },
  { value: 'lead_generation', label: 'Lead Generation', desc: 'Drive signups and inquiries' },
  { value: 'community_building', label: 'Community Building', desc: 'Build a loyal following' },
  { value: 'product_launch', label: 'Product Launch', desc: 'Generate buzz for something new' },
  { value: 'thought_leadership', label: 'Thought Leadership', desc: 'Establish authority in your space' },
]

const ROLE_LABELS: Record<string, string> = {
  main_character: 'Main Character',
  hype_person: 'Hype Person',
  expert: 'Expert',
  contrarian: 'Contrarian',
  storyteller: 'Storyteller',
  connector: 'Connector',
}

const ROLE_COLORS: Record<string, string> = {
  main_character: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  hype_person: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  expert: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contrarian: 'bg-red-500/20 text-red-400 border-red-500/30',
  storyteller: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  connector: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function OrbitManager({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<OrbitView>('list')
  const [projects, setProjects] = useState<OrbitProject[]>([])
  const [selectedProject, setSelectedProject] = useState<OrbitProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formAudience, setFormAudience] = useState('')
  const [formObjective, setFormObjective] = useState('brand_awareness')
  const [formCount, setFormCount] = useState<2 | 4 | 6>(4)
  const [costEstimate, setCostEstimate] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [generateStep, setGenerateStep] = useState<'form' | 'estimate' | 'generating'>('form')
  const [contentPosts, setContentPosts] = useState<any[]>([])
  const [contentLoading, setContentLoading] = useState(false)
  const [contentPlatform, setContentPlatform] = useState('')
  const [generatingContent, setGeneratingContent] = useState(false)
  const [contentFilter, setContentFilter] = useState<'all' | 'draft' | 'scheduled' | 'posted'>('all')
  const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [interactions, setInteractions] = useState<any[]>([])
  const [interactionsLoading, setInteractionsLoading] = useState(false)
  const [generatingInteractions, setGeneratingInteractions] = useState(false)
  const [networkData, setNetworkData] = useState<any>(null)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState<string | null>(null)

  // Strategy state
  const [strategyData, setStrategyData] = useState<any>(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategySuggestions, setStrategySuggestions] = useState<any[]>([])
  const [suggestingStrategy, setSuggestingStrategy] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState<string | null>(null)

  // ============================================
  // NETWORK GRAPH
  // ============================================

  const fetchNetwork = async (projectId: string) => {
    setNetworkLoading(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/network`)
      if (!res.ok) throw new Error('Failed to fetch network')
      const data = await res.json()
      setNetworkData(data)
    } catch (err) {
      console.error('Network fetch error:', err)
    } finally {
      setNetworkLoading(false)
    }
  }

  const updateRelationship = async (relationshipId: string, dynamic: string) => {
    if (!selectedProject) return
    try {
      const res = await fetch(`/api/orbit/${selectedProject.id}/network`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId, dynamic })
      })
      if (!res.ok) throw new Error('Failed to update relationship')
      fetchNetwork(selectedProject.id)
      setEditingRelationship(null)
    } catch (err) {
      console.error('Relationship update error:', err)
    }
  }

  // ============================================
  // STRATEGY BUILDER
  // ============================================

  const fetchStrategy = async (projectId: string) => {
    setStrategyLoading(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/strategy`)
      if (!res.ok) throw new Error('Failed to fetch strategy')
      const data = await res.json()
      setStrategyData(data)
    } catch (err) {
      console.error('Strategy fetch error:', err)
    } finally {
      setStrategyLoading(false)
    }
  }

  const requestSuggestions = async (projectId: string) => {
    setSuggestingStrategy(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/strategy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest' }),
      })
      if (!res.ok) throw new Error('Failed to get suggestions')
      const data = await res.json()
      setStrategySuggestions(data.suggestions || [])
    } catch (err) {
      console.error('Strategy suggestion error:', err)
    } finally {
      setSuggestingStrategy(false)
    }
  }

  const applySuggestions = async (projectId: string) => {
    try {
      const res = await fetch(`/api/orbit/${projectId}/strategy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply_suggestions', suggestions: strategySuggestions }),
      })
      if (!res.ok) throw new Error('Failed to apply suggestions')
      const data = await res.json()
      setStrategyData(data)
      setStrategySuggestions([])
    } catch (err) {
      console.error('Apply suggestions error:', err)
    }
  }

  const updateCharStrategy = async (characterId: string, updates: any) => {
    if (!selectedProject) return
    try {
      const res = await fetch(`/api/orbit/${selectedProject.id}/strategy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, updates }),
      })
      if (!res.ok) throw new Error('Failed to update character strategy')
      const data = await res.json()
      setStrategyData(data)
      setEditingStrategy(null)
    } catch (err) {
      console.error('Character strategy update error:', err)
    }
  }




  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const res = await fetch('/api/orbit')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch {
      setError('Failed to load orbit projects')
    }
    setLoading(false)
  }

  async function loadProjectDetail(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/orbit/${id}`)
      const data = await res.json()
      setSelectedProject(data.project)
      setView('detail')
      await loadContent(id)
      fetchInteractions(id)
      fetchNetwork(id)
      fetchStrategy(id)
    } catch {
      setError('Failed to load project detail')
    }
    setLoading(false)
  }

  async function getCostEstimate() {
    if (!formName || !formDesc) return
    setCreating(true)
    try {
      const res = await fetch('/api/orbit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDesc,
          websiteUrl: formUrl || undefined,
          targetAudience: formAudience || undefined,
          objective: formObjective,
          characterCount: formCount,
          confirm: false,
        }),
      })
      const data = await res.json()
      setCostEstimate(data.estimate)
      setGenerateStep('estimate')
    } catch {
      setError('Failed to get cost estimate')
    }
    setCreating(false)
  }

  async function confirmCreate() {
    setGenerateStep('generating')
    setCreating(true)
    try {
      const res = await fetch('/api/orbit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDesc,
          websiteUrl: formUrl || undefined,
          targetAudience: formAudience || undefined,
          objective: formObjective,
          characterCount: formCount,
          confirm: true,
        }),
      })
      const data = await res.json()
      if (data.projectId) {
        resetForm()
        await loadProjects()
        await loadProjectDetail(data.projectId)
      } else {
        setError(data.error || 'Failed to create orbit')
        setGenerateStep('form')
      }
    } catch {
      setError('Failed to create orbit project')
      setGenerateStep('form')
    }
    setCreating(false)
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this orbit project and all its characters?')) return
    try {
      await fetch(`/api/orbit/${id}`, { method: 'DELETE' })
      setView('list')
      setSelectedProject(null)
      await loadProjects()
    } catch {
      setError('Failed to delete project')
    }
  }

  async function loadContent(projectId: string) {
    setContentLoading(true)
    try {
      const res = await fetch(`/api/orbit/${projectId}/content`)
      const data = await res.json()
      setContentPosts(data.posts || [])
    } catch {
      console.error('Failed to load content')
    }
    setContentLoading(false)
  }

  async function generateContent() {
    if (!selectedProject) return
    setGeneratingContent(true)
    try {
      const res = await fetch(`/api/orbit/${selectedProject.id}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: contentPlatform || undefined,
          count: 1,
        }),
      })
      const data = await res.json()
      if (data.posts) {
        setContentPosts(prev => [...data.posts, ...prev])
      }
    } catch {
      setError('Failed to generate content')
    }
    setGeneratingContent(false)
  }

  async function deleteContentPost(postId: string) {
    if (!selectedProject) return
    try {
      await fetch(`/api/orbit/${selectedProject.id}/content?postId=${postId}`, { method: 'DELETE' })
      setContentPosts(prev => prev.filter(p => p.id !== postId))
    } catch {
      setError('Failed to delete post')
    }
  }
  async function schedulePost(postId: string) {
    if (!selectedProject || !scheduleDate) return
    try {
      await fetch('/api/orbit/' + selectedProject.id + '/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status: 'scheduled', scheduledFor: scheduleDate }),
      })
      setContentPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, status: 'scheduled', scheduledFor: scheduleDate } : p
      ))
      setSchedulingPostId(null)
      setScheduleDate('')
    } catch {
      setError('Failed to schedule post')
    }
  }

  async function updatePostStatus(postId: string, status: string) {
    if (!selectedProject) return
    try {
      await fetch('/api/orbit/' + selectedProject.id + '/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status }),
      })
      setContentPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, status } : p
      ))
    } catch {
      setError('Failed to update post status')
    }
  }

  function getFilteredPosts() {
    if (contentFilter === 'all') return contentPosts
    return contentPosts.filter((p: any) => p.status === contentFilter)
  }

  function getContentStats() {
    const total = contentPosts.length
    const drafts = contentPosts.filter((p: any) => !p.status || p.status === 'draft').length
    const scheduled = contentPosts.filter((p: any) => p.status === 'scheduled').length
    const posted = contentPosts.filter((p: any) => p.status === 'posted').length
    const platforms: Record<string, number> = {}
    const characters: Record<string, number> = {}
    const upcoming: any[] = []
    const now = new Date()
    contentPosts.forEach((p: any) => {
      platforms[p.platform] = (platforms[p.platform] || 0) + 1
      characters[p.characterName] = (characters[p.characterName] || 0) + 1
      if (p.status === 'scheduled' && p.scheduledFor) {
        const d = new Date(p.scheduledFor)
        if (d >= now) upcoming.push(p)
      }
    })
    upcoming.sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    return { total, drafts, scheduled, posted, platforms, characters, upcoming: upcoming.slice(0, 5) }
  }




  function resetForm() {
    setFormName('')
    setFormDesc('')
    setFormUrl('')
    setFormAudience('')
    setFormObjective('brand_awareness')
    setFormCount(4)
    setCostEstimate(null)
    setGenerateStep('form')
    setView('list')
  }

  // ============================================
  // RENDER
  // ============================================

  
  // ============================================
  // INTERACTIONS
  // ============================================

  const fetchInteractions = async (projectId: string) => {
    try {
      const res = await fetch(`/api/orbit/${projectId}/interactions`)
      if (res.ok) {
        const data = await res.json()
        setInteractions(data.interactions || [])
      }
    } catch (err) {
      console.error('Failed to fetch interactions:', err)
    }
  }


  const generateInteractions = async () => {
    if (!selectedProject || generatingInteractions) return
    setGeneratingInteractions(true)
    try {
      const res = await fetch(`/api/orbit/${selectedProject.id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3 }),
      })
      if (res.ok) {
        const data = await res.json()
        setInteractions(prev => [...prev, ...data.interactions])
      }
    } catch (err) {
      console.error('Failed to generate interactions:', err)
    } finally {
      setGeneratingInteractions(false)
    }
  }

  const deleteInteraction = async (interactionId: string) => {
    if (!selectedProject) return
    try {
      const res = await fetch(`/api/orbit/${selectedProject.id}/interactions?interactionId=${interactionId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setInteractions(prev => prev.filter(i => i.id !== interactionId))
      }
    } catch (err) {
      console.error('Failed to delete interaction:', err)
    }
  }

return (
    <div className="fixed inset-0 z-50 bg-continuum-bg/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-continuum-border">
        <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (view === 'list') onClose()
                else if (view === 'create') resetForm()
                else { setView('list'); setSelectedProject(null) }
              }}
              className="p-1.5 rounded-lg hover:bg-continuum-surface text-continuum-muted"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          <h2 className="text-lg font-semibold text-continuum-accent">
            {view === 'list' ? 'Orbit Network' : view === 'create' ? 'Create Orbit' : selectedProject?.name || 'Project'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-continuum-surface text-continuum-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400">x</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'list' && renderList()}
        {view === 'create' && renderCreate()}
        {view === 'detail' && selectedProject && renderDetail()}
      </div>
    </div>
  )

  // ============================================
  // LIST VIEW
  // ============================================

  function renderList() {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-continuum-accent/30 border-t-continuum-accent rounded-full" />
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* Description */}
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-continuum-accent/10 border border-continuum-accent/30 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-continuum-accent">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <p className="text-sm text-continuum-muted max-w-xs mx-auto">
            Create a network of AI influencers that work together to promote your project across social media.
          </p>
        </div>

        {/* Create button */}
        <button
          onClick={() => setView('create')}
          className="w-full px-4 py-3.5 rounded-xl text-sm font-medium bg-continuum-accent/15 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/25 transition flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create New Orbit
        </button>

        {/* Project cards */}
        {projects.length === 0 ? (
          <p className="text-center text-sm text-continuum-muted py-8">
            No orbit projects yet. Create your first one above.
          </p>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => loadProjectDetail(project.id)}
              className="w-full text-left p-4 rounded-xl bg-continuum-surface border border-continuum-border hover:border-continuum-accent/30 transition"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-continuum-text">{project.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  project.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : project.status === 'generating'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-continuum-surface text-continuum-muted border border-continuum-border'
                }`}>
                  {project.status}
                </span>
              </div>
              <p className="text-xs text-continuum-muted line-clamp-2 mb-3">{project.description}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {project.characters.map((char) => (
                  <span
                    key={char.id}
                    className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[char.roleType] || 'bg-continuum-surface text-continuum-muted border-continuum-border'}`}
                  >
                    {char.name}
                  </span>
                ))}
              </div>
            </button>
          ))
        )}
      </div>
    )
  }

  // ============================================
  // CREATE VIEW
  // ============================================

  function renderCreate() {
    if (generateStep === 'generating') {
      return (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="animate-spin w-8 h-8 border-2 border-continuum-accent/30 border-t-continuum-accent rounded-full" />
          <p className="text-sm text-continuum-muted">Generating your AI influencer network...</p>
          <p className="text-xs text-continuum-muted/60">This takes 30-60 seconds. The AI is creating personalities, relationships, and strategy.</p>
        </div>
      )
    }

    if (generateStep === 'estimate' && costEstimate) {
      return (
        <div className="space-y-6">
          <div className="text-center py-4">
            <h3 className="text-base font-medium text-continuum-text mb-2">Confirm Generation</h3>
            <p className="text-sm text-continuum-muted">Review the cost before we create your orbit.</p>
          </div>

          <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-continuum-muted">Project</span>
              <span className="text-continuum-text font-medium">{formName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-continuum-muted">Objective</span>
              <span className="text-continuum-text">{OBJECTIVES.find(o => o.value === formObjective)?.label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-continuum-muted">Characters</span>
              <span className="text-continuum-text">{formCount} AI influencers</span>
            </div>
            <div className="border-t border-continuum-border pt-3 flex justify-between text-sm">
              <span className="text-continuum-muted">Estimated Cost</span>
              <span className="text-continuum-accent font-semibold">
                ${typeof costEstimate.costEstimate === 'number'
                  ? costEstimate.costEstimate.toFixed(2)
                  : typeof costEstimate.costEstimate === 'object'
                  ? (costEstimate.costEstimate.totalCost || 0).toFixed(2)
                  : '0.00'}
              </span>
            </div>
          </div>

          <p className="text-xs text-continuum-muted/60 text-center">
            This cost covers AI generation of character profiles, relationships, and strategy. One-time charge.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setGenerateStep('form')}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-medium border border-continuum-border text-continuum-muted hover:bg-continuum-surface transition"
            >
              Go Back
            </button>
            <button
              onClick={confirmCreate}
              disabled={creating}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/30 transition disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Generate Orbit'}
            </button>
          </div>
        </div>
      )
    }

    // Form step
    return (
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="text-sm font-medium text-continuum-text mb-1 block">Project Name</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. My SaaS Launch"
            className="w-full bg-continuum-surface border border-continuum-border rounded-xl px-3.5 py-2.5 text-sm text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent/50"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-continuum-text mb-1 block">Description</label>
          <textarea
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="What is this project? What do you want the AI network to promote?"
            rows={3}
            className="w-full bg-continuum-surface border border-continuum-border rounded-xl px-3.5 py-2.5 text-sm text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent/50 resize-none"
          />
        </div>

        {/* Website URL */}
        <div>
          <label className="text-sm font-medium text-continuum-text mb-1 block">Website URL <span className="text-continuum-muted font-normal">(optional)</span></label>
          <input
            type="url"
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            placeholder="https://yourproject.com"
            className="w-full bg-continuum-surface border border-continuum-border rounded-xl px-3.5 py-2.5 text-sm text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent/50"
          />
        </div>

        {/* Target Audience */}
        <div>
          <label className="text-sm font-medium text-continuum-text mb-1 block">Target Audience <span className="text-continuum-muted font-normal">(optional)</span></label>
          <input
            type="text"
            value={formAudience}
            onChange={(e) => setFormAudience(e.target.value)}
            placeholder="e.g. Small business owners, Gen Z creators"
            className="w-full bg-continuum-surface border border-continuum-border rounded-xl px-3.5 py-2.5 text-sm text-continuum-text placeholder-continuum-muted/50 focus:outline-none focus:border-continuum-accent/50"
          />
        </div>

        {/* Objective */}
        <div>
          <label className="text-sm font-medium text-continuum-text mb-2 block">Objective</label>
          <div className="space-y-2">
            {OBJECTIVES.map((obj) => (
              <button
                key={obj.value}
                onClick={() => setFormObjective(obj.value)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm transition ${
                  formObjective === obj.value
                    ? 'bg-continuum-accent/10 border-continuum-accent/40 text-continuum-accent'
                    : 'bg-continuum-surface border-continuum-border text-continuum-text hover:border-continuum-accent/20'
                }`}
              >
                <span className="font-medium">{obj.label}</span>
                <span className="text-continuum-muted ml-2">{obj.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Character Count */}
        <div>
          <label className="text-sm font-medium text-continuum-text mb-2 block">Network Size</label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { n: 2, label: 'Minimal' },
              { n: 4, label: 'Balanced' },
              { n: 6, label: 'Full Network' },
            ] as const).map((opt) => (
              <button
                key={opt.n}
                onClick={() => setFormCount(opt.n)}
                className={`px-4 py-3 rounded-xl border text-sm transition text-center ${
                  formCount === opt.n
                    ? 'bg-continuum-accent/10 border-continuum-accent/40 text-continuum-accent'
                    : 'bg-continuum-surface border-continuum-border text-continuum-text hover:border-continuum-accent/20'
                }`}
              >
                <div className="font-semibold text-lg mb-0.5">{opt.n}</div>
                <div className="text-xs text-continuum-muted">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={getCostEstimate}
          disabled={!formName || !formDesc || creating}
          className="w-full px-4 py-3.5 rounded-xl text-sm font-medium bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {creating ? 'Calculating...' : 'See Cost Estimate'}
        </button>
      </div>
    )
  }

  // ============================================
  // DETAIL VIEW
  // ============================================

  function renderDetail() {
    if (!selectedProject) return null

    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-continuum-accent/30 border-t-continuum-accent rounded-full" />
        </div>
      )
    }

    const allRelationships: any[] = []
    selectedProject.characters.forEach((char) => {
      ;(char.relationshipsAsA || []).forEach((rel: any) => {
        if (!allRelationships.find((r) => r.id === rel.id)) {
          allRelationships.push({ ...rel, charAName: char.name })
        }
      })
      ;(char.relationshipsAsB || []).forEach((rel: any) => {
        if (!allRelationships.find((r) => r.id === rel.id)) {
          allRelationships.push({ ...rel, charBName: char.name })
        }
      })
    })

    return (
      <div className="space-y-6">
        {/* Project info */}
        <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border">
          <div className="flex items-start justify-between mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              selectedProject.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              {selectedProject.status}
            </span>
            <button
              onClick={() => deleteProject(selectedProject.id)}
              className="text-xs text-red-400/60 hover:text-red-400 transition"
            >
              Delete
            </button>
          </div>
          <p className="text-sm text-continuum-muted mb-2">{selectedProject.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-continuum-muted/60">
            <span>Objective: {OBJECTIVES.find(o => o.value === selectedProject.objective)?.label || selectedProject.objective}</span>
            {selectedProject.websiteUrl && <span>URL: {selectedProject.websiteUrl}</span>}
            {selectedProject.targetAudience && <span>Audience: {selectedProject.targetAudience}</span>}
          </div>
        </div>

        {/* Characters */}
        <div>
          <h3 className="text-sm font-medium text-continuum-text mb-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-accent">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Characters ({selectedProject.characters.length})
          </h3>
          <div className="space-y-3">
            {selectedProject.characters.map((char) => (
              <CharacterCard key={char.id} character={char} />
            ))}
          </div>
        </div>
<button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full mt-2 mb-3 px-4 py-3 rounded-xl text-sm font-medium bg-continuum-surface border border-continuum-border text-continuum-muted">{showAdvanced ? 'Hide advanced tools' : 'Show advanced tools'}</button>        
        <div style={{ display: showAdvanced ? 'block' : 'none' }}>   {/* Relationships */}
        {allRelationships.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-continuum-text mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-accent">
                <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
                <path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
              </svg>
              Relationships ({allRelationships.length})
            </h3>
            <div className="space-y-2">
              {allRelationships.map((rel, i) => (
                <div key={rel.id || i} className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-continuum-accent/10 text-continuum-accent border border-continuum-accent/20">
                      {rel.relationshipType?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-continuum-muted">{rel.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strategy Table */}
        {selectedProject.strategyTable && selectedProject.strategyTable.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-continuum-text mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-accent">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Strategy
            </h3>
            <div className="space-y-2">
              {(selectedProject.strategyTable as any[]).map((strat: any, i: number) => (
                <div key={i} className="p-3 rounded-xl bg-continuum-surface border border-continuum-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-continuum-text">{strat.character}</span>
                    <span className="text-xs text-continuum-muted">{strat.postFrequency}</span>
                  </div>
                  <p className="text-xs text-continuum-muted mb-2">{strat.contentAngle}</p>
                  <div className="flex flex-wrap gap-1">
                    {(strat.platforms || []).map((p: string, j: number) => (
                      <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-continuum-surface border border-continuum-border text-continuum-muted">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orbit Analytics */}
        {contentPosts.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-continuum-text mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-accent">
                <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
              </svg>
              Content Analytics
            </h3>
            <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 rounded-lg bg-continuum-bg">
                  <div className="text-lg font-bold text-continuum-text">{getContentStats().total}</div>
                  <div className="text-xs text-continuum-muted">Total</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-continuum-bg">
                  <div className="text-lg font-bold text-continuum-muted">{getContentStats().drafts}</div>
                  <div className="text-xs text-continuum-muted">Drafts</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-continuum-bg">
                  <div className="text-lg font-bold text-yellow-400">{getContentStats().scheduled}</div>
                  <div className="text-xs text-continuum-muted">Scheduled</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-continuum-bg">
                  <div className="text-lg font-bold text-green-400">{getContentStats().posted}</div>
                  <div className="text-xs text-continuum-muted">Posted</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-continuum-muted mb-1.5">By Platform</div>
                  <div className="space-y-1">
                    {Object.entries(getContentStats().platforms).map(([plat, count]) => (
                      <div key={plat} className="flex items-center justify-between text-xs">
                        <span className="text-continuum-text">{plat}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 rounded-full bg-continuum-accent/30" style={{ width: Math.max(20, (count as number / getContentStats().total) * 80) + 'px' }} />
                          <span className="text-continuum-muted w-4 text-right">{count as number}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-continuum-muted mb-1.5">By Character</div>
                  <div className="space-y-1">
                    {Object.entries(getContentStats().characters).map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between text-xs">
                        <span className="text-continuum-text truncate mr-2">{name}</span>
                        <span className="text-continuum-muted">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {getContentStats().upcoming.length > 0 && (
                <div>
                  <div className="text-xs text-continuum-muted mb-1.5">Upcoming Scheduled</div>
                  <div className="space-y-1">
                    {getContentStats().upcoming.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-continuum-bg">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400/60">&#9679;</span>
                          <span className="text-continuum-text truncate">{p.characterName}</span>
                          <span className="text-continuum-muted">{p.platform}</span>
                        </div>
                        <span className="text-continuum-muted/60">{new Date(p.scheduledFor).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        
        {/* Network Map */}
        {selectedProject && (
          <div className="rounded-xl bg-continuum-surface border border-continuum-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-continuum-text">Network Map</h3>
              <button
                onClick={() => fetchNetwork(selectedProject.id)}
                disabled={networkLoading}
                className="px-3 py-1.5 text-sm rounded-lg bg-continuum-accent/20 text-continuum-accent hover:bg-continuum-accent/30 disabled:opacity-50"
              >
                {networkLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {networkData ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="rounded-lg bg-continuum-bg/50 p-3 text-center">
                    <div className="text-2xl font-bold text-continuum-accent">{networkData.stats?.totalNodes ?? 0}</div>
                    <div className="text-xs text-continuum-muted">Characters</div>
                  </div>
                  <div className="rounded-lg bg-continuum-bg/50 p-3 text-center">
                    <div className="text-2xl font-bold text-continuum-accent">{networkData.stats?.totalEdges ?? 0}</div>
                    <div className="text-xs text-continuum-muted">Connections</div>
                  </div>
                  <div className="rounded-lg bg-continuum-bg/50 p-3 text-center">
                    <div className="text-2xl font-bold text-continuum-accent">{(networkData.stats?.avgStrength ?? 0).toFixed(1)}</div>
                    <div className="text-xs text-continuum-muted">Avg Strength</div>
                  </div>
                  <div className="rounded-lg bg-continuum-bg/50 p-3 text-center">
                    <div className="text-2xl font-bold text-continuum-accent">{networkData.stats?.totalInteractions ?? 0}</div>
                    <div className="text-xs text-continuum-muted">Interactions</div>
                  </div>
                </div>

                {/* Highlight Stats */}
                {networkData.stats?.mostConnected && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                    <div className="rounded-lg border border-continuum-border p-3">
                      <div className="text-xs text-continuum-muted mb-1">Most Connected</div>
                      <div className="text-sm font-medium text-continuum-text">{networkData.stats.mostConnected.name}</div>
                      <div className="text-xs text-continuum-muted">{networkData.stats.mostConnected.connectionCount} connections</div>
                    </div>
                    {networkData.stats?.mostActive && (
                      <div className="rounded-lg border border-continuum-border p-3">
                        <div className="text-xs text-continuum-muted mb-1">Most Active</div>
                        <div className="text-sm font-medium text-continuum-text">{networkData.stats.mostActive.name}</div>
                        <div className="text-xs text-continuum-muted">{networkData.stats.mostActive.interactionCount} interactions</div>
                      </div>
                    )}
                    {networkData.stats?.strongestBond && (
                      <div className="rounded-lg border border-continuum-border p-3">
                        <div className="text-xs text-continuum-muted mb-1">Strongest Bond</div>
                        <div className="text-sm font-medium text-continuum-text">{networkData.stats.strongestBond.source} & {networkData.stats.strongestBond.target}</div>
                        <div className="text-xs text-continuum-muted">Strength: {networkData.stats.strongestBond.strength}/10</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Character Nodes */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-continuum-muted mb-3">Characters</h4>
                  <div className="flex flex-wrap gap-3">
                    {(networkData.nodes || []).map((node: any) => (
                      <div key={node.id} className="flex items-center gap-2 rounded-lg border border-continuum-border p-2 px-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: node.color }} />
                        <div>
                          <div className="text-sm font-medium text-continuum-text">{node.name}</div>
                          <div className="text-xs text-continuum-muted">@{node.username} · {node.connectionCount} links · {node.interactionCount} interactions</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Relationship Edges */}
                <div>
                  <h4 className="text-sm font-medium text-continuum-muted mb-3">Relationships</h4>
                  <div className="space-y-2">
                    {(networkData.edges || []).map((edge: any) => (
                      <div key={edge.id} className="flex items-center justify-between rounded-lg border border-continuum-border p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-continuum-text">{edge.source}</span>
                          <span className="text-xs text-continuum-muted">&harr;</span>
                          <span className="text-sm text-continuum-text">{edge.target}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {editingRelationship === edge.id ? (
                            <select
                              value={edge.dynamic}
                              onChange={(e) => updateRelationship(edge.id, e.target.value)}
                              className="text-xs rounded bg-continuum-bg border border-continuum-border text-continuum-text px-2 py-1"
                            >
                              <option value="allies">Allies</option>
                              <option value="rivals">Rivals</option>
                              <option value="mentor_mentee">Mentor/Mentee</option>
                              <option value="collaborators">Collaborators</option>
                              <option value="frenemies">Frenemies</option>
                              <option value="complementary">Complementary</option>
                              <option value="competitive">Competitive</option>
                            </select>
                          ) : (
                            <button
                              onClick={() => setEditingRelationship(edge.id)}
                              className="text-xs rounded px-2 py-0.5 text-white"
                              style={{ backgroundColor: edge.color }}
                            >
                              {edge.dynamicLabel}
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            <div className="w-20 h-1.5 rounded-full bg-continuum-bg overflow-hidden">
                              <div
                                className="h-full rounded-full bg-continuum-accent"
                                style={{ width: `${(edge.strength / 10) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-continuum-muted">{edge.strength}/10</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(networkData.edges || []).length === 0 && (
                      <div className="text-center py-4 text-continuum-muted text-sm">No relationships yet. Generate interactions first.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-continuum-muted">
                {networkLoading ? 'Loading network data...' : 'Click Refresh to load the network map'}
              </div>
            )}
          </div>
        )}

        {/* Strategy Builder */}
        <div className="mt-6 bg-continuum-surface border border-continuum-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-continuum-text">Strategy Builder</h3>
            <div className="flex gap-2">
              <button
                onClick={() => selectedProject && fetchStrategy(selectedProject.id)}
                disabled={strategyLoading}
                className="px-3 py-1.5 text-xs bg-continuum-border text-continuum-text rounded hover:bg-continuum-muted/30 transition-colors"
              >
                {strategyLoading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={() => selectedProject && requestSuggestions(selectedProject.id)}
                disabled={suggestingStrategy}
                className="px-3 py-1.5 text-xs bg-continuum-accent text-white rounded hover:bg-continuum-accent-dim transition-colors"
              >
                {suggestingStrategy ? 'Thinking...' : 'AI Suggest'}
              </button>
            </div>
          </div>

          {/* AI Suggestions Banner */}
          {strategySuggestions.length > 0 && (
            <div className="mb-4 p-3 bg-continuum-accent/10 border border-continuum-accent/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-continuum-accent">AI Strategy Suggestions Ready</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStrategySuggestions([])}
                    className="px-2 py-1 text-xs text-continuum-muted hover:text-continuum-text"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => selectedProject && applySuggestions(selectedProject.id)}
                    className="px-3 py-1 text-xs bg-continuum-accent text-white rounded hover:bg-continuum-accent-dim"
                  >
                    Apply All
                  </button>
                </div>
              </div>
              {strategySuggestions.map((s: any) => (
                <div key={s.characterId} className="mt-2 p-2 bg-continuum-bg/50 rounded text-xs">
                  <span className="text-continuum-accent font-medium">{s.suggestions?.contentAngle}</span>
                  <span className="text-continuum-muted ml-2">{s.suggestions?.reasoning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Strategy Cards */}
          {strategyData?.entries?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {strategyData.entries.map((entry: any) => (
                <div key={entry.characterId} className="bg-continuum-bg border border-continuum-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-continuum-text">{entry.characterName}</span>
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-continuum-accent/20 text-continuum-accent">{entry.role}</span>
                    </div>
                    <button
                      onClick={() => setEditingStrategy(editingStrategy === entry.characterId ? null : entry.characterId)}
                      className="text-xs text-continuum-muted hover:text-continuum-text"
                    >
                      {editingStrategy === entry.characterId ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div><span className="text-continuum-muted">Angle:</span> <span className="text-continuum-text">{entry.contentAngle || 'Not set'}</span></div>
                    <div><span className="text-continuum-muted">Goal:</span> <span className="text-continuum-text">{entry.goal || 'Not set'}</span></div>
                    <div><span className="text-continuum-muted">Frequency:</span> <span className="text-continuum-text">{entry.postingFrequency?.replace(/_/g, ' ') || 'daily'}</span></div>
                    {entry.contentThemes?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.contentThemes.map((theme: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-continuum-border rounded text-continuum-muted">{theme}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-continuum-muted text-sm">
              {strategyLoading ? 'Loading strategy...' : 'Click Refresh to load strategy data'}
            </div>
          )}
        </div>
{/* Cross-Character Interactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-continuum-text">Cross-Character Interactions</h3>
            <button
              onClick={generateInteractions}
              disabled={generatingInteractions}
              className="px-3 py-1.5 bg-continuum-accent/20 text-continuum-accent rounded-lg text-xs hover:bg-continuum-accent/30 disabled:opacity-50"
            >
              {generatingInteractions ? 'Generating...' : 'Generate Interactions'}
            </button>
          </div>
          <p className="text-xs text-continuum-muted mb-3">AI characters commenting, replying, and collaborating with each other</p>
          
          {interactions.length === 0 ? (
            <div className="text-center py-6 bg-continuum-surface/50 rounded-lg border border-continuum-border/30">
              <p className="text-continuum-muted text-sm">No interactions yet</p>
              <p className="text-continuum-muted/60 text-xs mt-1">Generate interactions to make your orbit feel alive</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {interactions.map((interaction: any) => (
                <div key={interaction.id} className="bg-continuum-surface/50 rounded-lg border border-continuum-border/30 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        interaction.type === 'comment' ? 'bg-blue-500/20 text-blue-400' :
                        interaction.type === 'reply' ? 'bg-green-500/20 text-green-400' :
                        interaction.type === 'shoutout' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-purple-500/20 text-purple-400'
                      }`}>
                        {interaction.type}
                      </span>
                      <span className="text-xs text-continuum-muted">{interaction.platform}</span>
                    </div>
                    <button
                      onClick={() => deleteInteraction(interaction.id)}
                      className="text-continuum-muted hover:text-red-400 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="text-xs text-continuum-accent mb-1">
                    {interaction.fromCharacterName} → {interaction.toCharacterName}
                  </div>
                  {interaction.postPreview && (
                    <div className="text-xs text-continuum-muted/60 italic mb-2 pl-2 border-l-2 border-continuum-border/30">
                      Re: "{interaction.postPreview}..."
                    </div>
                  )}
                  <p className="text-sm text-continuum-text/90">{interaction.content}</p>
                  <div className="text-xs text-continuum-muted/50 mt-2">
                    {new Date(interaction.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content Generation */}
        <div>
          <h3 className="text-sm font-medium text-continuum-text mb-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-accent">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Content Generator
          </h3>
          <div className="p-4 rounded-xl bg-continuum-surface border border-continuum-border space-y-3">
            <div className="flex gap-2">
              <select
                value={contentPlatform}
                onChange={(e) => setContentPlatform(e.target.value)}
                className="flex-1 bg-continuum-bg border border-continuum-border rounded-lg px-3 py-2 text-sm text-continuum-text focus:outline-none focus:border-continuum-accent/50"
              >
                <option value="">All Platforms</option>
                <option value="Instagram">Instagram</option>
                <option value="Twitter/X">Twitter/X</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="TikTok">TikTok</option>
              </select>
              <button
                onClick={generateContent}
                disabled={generatingContent}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/30 hover:bg-continuum-accent/30 transition disabled:opacity-50 flex items-center gap-2"
              >
                {generatingContent ? (
                  <>
                    <div className="animate-spin w-3.5 h-3.5 border-2 border-continuum-accent/30 border-t-continuum-accent rounded-full" />
                    Generating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Generate
                  </>
                )}
              </button>
            </div>
            {generatingContent && (
              <p className="text-xs text-continuum-muted/60 text-center">Creating posts for each active character... ~15-30s</p>
            )}
          </div>
        </div>

        {/* Generated Posts */}
              {contentPosts.length > 0 && (
          <div className="flex gap-1 mb-3">
            {(['all', 'draft', 'scheduled', 'posted'] as const).map(f => (
              <button
                key={f}
                onClick={() => setContentFilter(f)}
                className={'px-3 py-1 rounded-full text-xs font-medium transition ' + (contentFilter === f ? 'bg-continuum-accent/20 text-continuum-accent border border-continuum-accent/30' : 'bg-continuum-surface text-continuum-muted border border-continuum-border hover:text-continuum-text')}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all' ? contentPosts.length : contentPosts.filter((p: any) => p.status === f).length})
              </button>
            ))}
          </div>
      )}
{contentPosts.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-continuum-text mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-continuum-accent">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              Generated Posts ({getFilteredPosts().length})
            </h3>
            <div className="space-y-3">
              {getFilteredPosts().map((post: any) => (
                <div key={post.id} className="p-3.5 rounded-xl bg-continuum-surface border border-continuum-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[post.roleType] || "bg-continuum-surface text-continuum-muted border-continuum-border"}`}>
                        {post.characterName}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-continuum-bg border border-continuum-border text-continuum-muted">
                        {post.platform}
                      </span>
                      <span className="text-xs text-continuum-muted/40">{post.tone}</span>
                    {post.status && post.status !== 'draft' && (
                      <span className={'text-xs px-2 py-0.5 rounded-full ' + (post.status === 'scheduled' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30')}>
                        {post.status}
                      </span>
                    )}
                    {post.scheduledFor && (
                      <span className="text-xs text-continuum-muted/40">{new Date(post.scheduledFor).toLocaleDateString()}</span>
                    )}
                    </div>
                    <button
                      onClick={() => deleteContentPost(post.id)}
                      className="text-xs text-red-400/40 hover:text-red-400 transition"
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-sm text-continuum-text whitespace-pre-wrap mb-2">{post.content}</p>
                  {post.hashtags && post.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.hashtags.map((tag: string, i: number) => (
                        <span key={i} className="text-xs text-continuum-accent/60">#{tag}</span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { navigator.clipboard.writeText(post.content + (post.hashtags?.length ? "\n\n" + post.hashtags.map((t: string) => "#" + t).join(" ") : "")) }}
                    className="mt-2 text-xs text-continuum-muted hover:text-continuum-accent transition"
                  >
                    Copy to clipboard
                  </button>
                  <div className="flex items-center gap-2 mt-2">
                    {schedulingPostId === post.id ? (
                      <>
                        <input
                          type="datetime-local"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="bg-continuum-bg border border-continuum-border rounded-lg px-2 py-1 text-xs text-continuum-text focus:outline-none focus:border-continuum-accent/50"
                        />
                        <button onClick={() => schedulePost(post.id)} className="text-xs text-continuum-accent hover:text-continuum-accent/80 transition">Save</button>
                        <button onClick={() => { setSchedulingPostId(null); setScheduleDate(''); }} className="text-xs text-continuum-muted hover:text-continuum-text transition">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setSchedulingPostId(post.id)} className="text-xs text-continuum-muted hover:text-continuum-accent transition">Schedule</button>
                        {post.status === 'scheduled' && (
                          <button onClick={() => updatePostStatus(post.id, 'posted')} className="text-xs text-green-400/60 hover:text-green-400 transition">Mark Posted</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* AUTOMATION ENGINE */}
        <OrbitAutomationPanel
          projectId={selectedProject.id}
          characters={selectedProject.characters}
        />

        {/* CONTENT FEED & POST MANAGEMENT */}
        <OrbitContentFeed
          projectId={selectedProject.id}
          characters={selectedProject.characters}
        />

      {/* CAMPAIGN MANAGER */}
      <OrbitCampaignManager
        projectId={selectedProject.id}
        characters={selectedProject.characters.map((c: any) => ({ id: c.id, name: c.name, role: c.roleType }))}
      />

      {/* PERFORMANCE ANALYTICS */}
      <OrbitAnalyticsDashboard projectId={selectedProject.id} />
        </div>

      {/* CONTENT CALENDAR */}
      <OrbitImageStudio projectId={selectedProject.id} characters={(selectedProject.characters || []).map((c: any) => ({ id: c.id, name: c.name }))} posts={contentPosts} onChange={() => loadContent(selectedProject.id)} />
        <OrbitPostingPlan projectId={selectedProject.id} posts={contentPosts} onChange={() => loadContent(selectedProject.id)} />
        <OrbitCalendar projectId={selectedProject.id} />
      </div>
    )
  }
}

// ============================================
// CHARACTER CARD
// ============================================

function CharacterCard({ character }: { character: any }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl bg-continuum-surface border border-continuum-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3.5 flex items-center gap-3"
      >
        {/* Avatar placeholder */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border ${ROLE_COLORS[character.roleType] || 'bg-continuum-surface text-continuum-muted border-continuum-border'}`}>
          {character.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-continuum-text">{character.name}</span>
            <span className="text-xs text-continuum-muted">@{character.username}</span>
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${ROLE_COLORS[character.roleType] || ''}`}>
            {ROLE_LABELS[character.roleType] || character.roleType}
          </span>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-continuum-muted transition ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-continuum-border pt-3">
          {character.contentAngle && (
            <div>
              <span className="text-xs font-medium text-continuum-muted block mb-0.5">Content Angle</span>
              <p className="text-xs text-continuum-text">{character.contentAngle}</p>
            </div>
          )}
          {character.goal && (
            <div>
              <span className="text-xs font-medium text-continuum-muted block mb-0.5">Goal</span>
              <p className="text-xs text-continuum-text">{character.goal}</p>
            </div>
          )}
          {character.personality && typeof character.personality === 'object' && (
            <div>
              <span className="text-xs font-medium text-continuum-muted block mb-1">Personality</span>
              <div className="flex flex-wrap gap-1">
                {Object.keys(character.personality).map((trait) => (
                  <span key={trait} className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    {trait}
                  </span>
                ))}
                </div>
            </div>
          )}
          {character.imagePrompt && (
            <div>
              <span className="text-xs font-medium text-continuum-muted block mb-0.5">Image Prompt</span>
              <p className="text-xs text-continuum-text/60 italic">{character.imagePrompt}</p>
            </div>
          )}
          <OrbitImageSlots character={character} />
        </div>
      )}
    </div>
  )
}


// ============================================
// ORBIT CHARACTER PROFILE IMAGE SLOTS (6 labeled)
// ============================================

function OrbitImageSlots({ character }: { character: any }) {
  const SLOTS = [
    { key: 'face_front', label: 'Front Facial Profile' },
    { key: 'face_left', label: 'Left Facial Profile' },
    { key: 'face_right', label: 'Right Facial Profile' },
    { key: 'body_front', label: 'Front Full Body Profile' },
    { key: 'body_left', label: 'Left Full Body Profile' },
    { key: 'body_right', label: 'Right Full Body Profile' },
  ]
  const initial =
    character.profileImages && typeof character.profileImages === 'object' && !Array.isArray(character.profileImages)
      ? (character.profileImages as Record<string, string>)
      : {}
  const [images, setImages] = useState<Record<string, string>>(initial)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  async function handleFile(slot: string, file: File | null) {
    if (!file) return
    setError(null)
    setUploading(slot)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('characterId', character.id)
      fd.append('slot', slot)
      const res = await fetch('/api/orbit/character-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setImages((prev) => ({ ...prev, [slot]: data.url }))
    } catch (e: any) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  return (
    <div>
      <span className="text-xs font-medium text-continuum-muted block mb-1">Profile Images</span>
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.map((s) => {
          const img = images[s.key]
          return (
            <div key={s.key}>
              <div className="aspect-square rounded-lg border border-continuum-border bg-continuum-bg overflow-hidden flex items-center justify-center relative">
                {img ? (
                  <button type="button" onClick={() => setLightbox(img)} className="w-full h-full" title="Click to enlarge">
                    <img src={img} alt={s.label} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <label className="cursor-pointer w-full h-full flex items-center justify-center">
                    <span className="text-[10px] text-continuum-muted text-center px-1">
                      {uploading === s.key ? 'Uploading...' : '+ Add'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading === s.key}
                      onChange={(e) => handleFile(s.key, e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                    />
                  </label>
                )}
                {img && uploading === s.key && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-[10px] text-white">
                    Uploading...
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-continuum-muted leading-tight">{s.label}</span>
                {img && (
                  <label className="text-[10px] text-continuum-accent cursor-pointer shrink-0">
                    Change
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading === s.key}
                      onChange={(e) => handleFile(s.key, e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                    />
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={lightbox} alt="Enlarged profile" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  )
}
