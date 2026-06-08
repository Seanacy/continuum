// ============================================
// CONTINUUM ORBIT: API ROUTES
// ============================================
// GET  /api/orbit — list user's orbit projects
// POST /api/orbit — create new orbit project + generate characters
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { generateOrbit, getUserOrbitProjects } from '@/lib/orbit-engine'
import { estimateSetupCost, type OrbitObjective } from '@/lib/orbit-roles'


// ============================================
// GET — List all orbit projects for the user
// ============================================

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const projects = await getUserOrbitProjects(user.id)

    return NextResponse.json({ projects })
  } catch (err) {
    console.error('GET /api/orbit error:', err)
    return NextResponse.json({ error: 'Failed to fetch orbit projects' }, { status: 500 })
  }
}


// ============================================
// POST — Create a new orbit project
// ============================================
// Body: {
//   name: string,
//   description: string,
//   websiteUrl?: string,
//   targetAudience?: string,
//   objective: OrbitObjective,
//   characterCount: 2 | 4 | 6,
//   confirm?: boolean  // if false, just return cost estimate
// }

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      name,
      description,
      websiteUrl,
      targetAudience,
      objective,
      characterCount = 4,
      confirm = false,
    } = body

    // Validate required fields
    if (!name || !description || !objective) {
      return NextResponse.json(
        { error: 'Missing required fields: name, description, objective' },
        { status: 400 }
      )
    }

    // Validate character count
    if (characterCount !== 2 && characterCount !== 4 && characterCount !== 6) {
      return NextResponse.json(
        { error: 'characterCount must be 2, 4, or 6' },
        { status: 400 }
      )
    }

    // If not confirmed, return cost estimate only
    if (!confirm) {
      const estimate = estimateSetupCost(characterCount)
      return NextResponse.json({
        estimate: {
          characterCount,
          objective,
          costEstimate: estimate,
        },
        message: 'Send confirm: true to proceed with generation',
      })
    }

    // Generate the full orbit
    const result = await generateOrbit({
      userId: user.id,
      name,
      description,
      websiteUrl: websiteUrl || undefined,
      targetAudience: targetAudience || undefined,
      objective: objective as OrbitObjective,
      characterCount,
    })

    return NextResponse.json({
      projectId: result.projectId,
      characters: result.characters,
      relationshipCount: result.relationshipCount,
      estimatedCost: result.estimatedCost,
    })
  } catch (err) {
    console.error('POST /api/orbit error:', err)
    return NextResponse.json({ error: 'Failed to create orbit project' }, { status: 500 })
  }
}
