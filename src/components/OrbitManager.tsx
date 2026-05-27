'use client'

import { useState, useEffect } from 'react'

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

  // Create form state
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formAudience, setFormAudience] = useState('')
  const [formObjective, setFormObjective] = useState('brand_awareness')
  const [formCount, setFormCount] = useState<3 | 6>(3)
  const [costEstimate, setCostEstimate] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [generateStep, setGenerateStep] = useState<'form' | 'estimate' | 'generating'>('form')

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

  function resetForm() {
    setFormName('')
    setFormDesc('')
    setFormUrl('')
    setFormAudience('')
    setFormObjective('brand_awareness')
    setFormCount(3)
    setCostEstimate(null)
    setGenerateStep('form')
    setView('list')
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="fixed inset-0 z-50 bg-continuum-bg/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-continuum-border">
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button
              onClick={() => {
                if (view === 'create') resetForm()
                else { setView('list'); setSelectedProject(null) }
              }}
              className="p-1.5 rounded-lg hover:bg-continuum-surface text-continuum-muted"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
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
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFormCount(3)}
              className={`px-4 py-3 rounded-xl border text-sm transition text-center ${
                formCount === 3
                  ? 'bg-continuum-accent/10 border-continuum-accent/40 text-continuum-accent'
                  : 'bg-continuum-surface border-continuum-border text-continuum-text hover:border-continuum-accent/20'
              }`}
            >
              <div className="font-semibold text-lg mb-0.5">3</div>
              <div className="text-xs text-continuum-muted">Budget Mode</div>
            </button>
            <button
              onClick={() => setFormCount(6)}
              className={`px-4 py-3 rounded-xl border text-sm transition text-center ${
                formCount === 6
                  ? 'bg-continuum-accent/10 border-continuum-accent/40 text-continuum-accent'
                  : 'bg-continuum-surface border-continuum-border text-continuum-text hover:border-continuum-accent/20'
              }`}
            >
              <div className="font-semibold text-lg mb-0.5">6</div>
              <div className="text-xs text-continuum-muted">Full Network</div>
            </button>
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

        {/* Relationships */}
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
        </div>
      )}
    </div>
  )
}
