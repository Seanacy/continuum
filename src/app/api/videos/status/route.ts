import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getVideoJobStatus, getUserVideoJobs } from '@/lib/video-pipeline'

export const dynamic = 'force-dynamic'

// GET — check video job status or list all jobs
// ?jobId=xxx — get specific job status
// (no params) — list all user's video jobs
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')

  if (jobId) {
    const status = await getVideoJobStatus(jobId, user.id)
    if (!status) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return NextResponse.json(status)
  }

  // List all video jobs
  const jobs = await getUserVideoJobs(user.id)
  return NextResponse.json({ jobs })
}
