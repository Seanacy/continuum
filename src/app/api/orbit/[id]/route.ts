// ============================================
// CONTINUUM ORBIT: PROJECT DETAIL ROUTES
// ============================================
// GET    /api/orbit/[id] — get orbit project with characters + relationships
// DELETE /api/orbit/[id] — delete an orbit project
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getOrbitProject, deleteOrbitProject } from '@/lib/orbit-engine'


// ============================================
// GET — Get full orbit project detail
// ============================================

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const project = await getOrbitProject(params.id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Make sure the user owns this project
    if (project.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ project })
  } catch (err) {
    console.error('GET /api/orbit/[id] error:', err)
    return NextResponse.json({ error: 'Failed to fetch orbit project' }, { status: 500 })
  }
}


// ============================================
// DELETE — Remove an orbit project and all its data
// ============================================

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify ownership before deleting
    const project = await getOrbitProject(params.id)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteOrbitProject(params.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/orbit/[id] error:', err)
    return NextResponse.json({ error: 'Failed to delete orbit project' }, { status: 500 })
  }
}
