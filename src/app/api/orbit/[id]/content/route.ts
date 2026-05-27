import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { generateOrbitContent, getOrbitContent, deleteOrbitPost } from '@/lib/orbit-content'

// GET /api/orbit/[id]/content — fetch generated content for an orbit project
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const posts = await getOrbitContent(params.id, user.id)
    return NextResponse.json({ posts })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch content' }, { status: 500 })
  }
}

// POST /api/orbit/[id]/content — generate new content for orbit characters
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { platform, count } = body

    const result = await generateOrbitContent({
      projectId: params.id,
      userId: user.id,
      platform: platform || undefined,
      count: count || 1,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate content' }, { status: 500 })
  }
}

// DELETE /api/orbit/[id]/content — delete a specific generated post
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const postId = searchParams.get('postId')
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 })
    }

    await deleteOrbitPost(params.id, user.id, postId)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete post' }, { status: 500 })
  }
}
