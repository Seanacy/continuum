import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { generateOrbitInteractions, getOrbitInteractions, deleteOrbitInteraction } from '@/lib/orbit-interactions'

// GET /api/orbit/[id]/interactions — fetch all interactions for an orbit project
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const interactions = await getOrbitInteractions(params.id, user.id)
    return NextResponse.json({ interactions })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch interactions' }, { status: 500 })
  }
}

// POST /api/orbit/[id]/interactions — generate new cross-character interactions
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { count } = body

    const result = await generateOrbitInteractions({
      projectId: params.id,
      userId: user.id,
      count: count || 3,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate interactions' }, { status: 500 })
  }
}

// DELETE /api/orbit/[id]/interactions — delete a specific interaction
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const interactionId = searchParams.get('interactionId')
    if (!interactionId) {
      return NextResponse.json({ error: 'interactionId required' }, { status: 400 })
    }

    await deleteOrbitInteraction(params.id, user.id, interactionId)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete interaction' }, { status: 500 })
  }
}
