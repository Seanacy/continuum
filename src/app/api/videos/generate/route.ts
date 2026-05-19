import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { startVideoGeneration } from '@/lib/video-pipeline'

export const dynamic = 'force-dynamic'

// POST — start a video generation job
// Body: { characterId: string, prompt?: string }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { characterId, prompt } = body

  if (!characterId) {
    return NextResponse.json(
      { error: 'characterId is required' },
      { status: 400 }
    )
  }

  const result = await startVideoGeneration(user.id, characterId, prompt)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 402 } // Payment Required
    )
  }

  return NextResponse.json({
    success: true,
    jobId: result.jobId,
    message: 'Video generation started. Check status for progress.',
  })
}
