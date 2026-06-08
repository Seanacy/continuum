import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// POST — attach an image to a single posting-plan post.
// Multipart form: file, projectId, postId.
// Stored at orbit/<characterId>/posts/<postId>.<ext> so the existing
// /api/img doorman authorizes it via the character's project ownership.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null
    const postId = formData.get('postId') as string | null

    if (!file || !projectId || !postId) {
      return NextResponse.json({ error: 'file, projectId, and postId are required' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Verify the project belongs to this user and pull its posts.
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true, strategyTable: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const strategyTable: any = project.strategyTable || {}
    const posts: any[] = Array.isArray(strategyTable?.generatedContent)
      ? strategyTable.generatedContent
      : []
    const post = posts.find((p) => p && p.id === postId)
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const characterId: string = post.characterId
    if (!characterId) {
      return NextResponse.json({ error: 'Post has no character' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const storagePath = `orbit/${characterId}/posts/${postId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 })
    }

    const url = '/api/img/' + storagePath + '?t=' + Date.now()

    // Write the image URL back onto the matching post.
    const updated = posts.map((p) =>
      p && p.id === postId ? { ...p, imageUrl: url } : p
    )
    await db.orbitProject.update({
      where: { id: projectId },
      data: {
        strategyTable: { ...strategyTable, generatedContent: updated } as any,
      },
    })

    return NextResponse.json({ url, postId })
  } catch (err: any) {
    console.error('POST /api/orbit/post-image error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
