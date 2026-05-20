import { NextRequest, NextResponse } from 'next/server'
import { runCreativeGeneration } from '@/lib/creative-engine'
import { runScriptGeneration } from '@/lib/script-engine'

export const dynamic = 'force-dynamic'

// Triggered by Vercel Cron or external scheduler
// Schedule: every 8 hours
// Generates creative content (all users) + video scripts (pro only)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [creative, scripts] = await Promise.all([
    runCreativeGeneration(),
    runScriptGeneration(),
  ])

  return NextResponse.json({
    success: true,
    creative: creative.processed,
    scripts: scripts.generated,
  })
}
