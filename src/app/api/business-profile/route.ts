import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Required fields for Content Pack
const REQUIRED_FIELDS = ['location', 'businessType', 'businessName', 'specialties', 'targetAudience'] as const

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Query business profile fields directly (getCurrentUser doesn't include them)
  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    select: { location: true, businessType: true, businessName: true, specialties: true, targetAudience: true }
  })

  const profile = {
    location: (fullUser as any)?.location || '',
    businessType: (fullUser as any)?.businessType || '',
    businessName: (fullUser as any)?.businessName || '',
    specialties: (fullUser as any)?.specialties || '',
    targetAudience: (fullUser as any)?.targetAudience || '',
  }

  const missingFields = REQUIRED_FIELDS.filter(f => !profile[f])
  const isComplete = missingFields.length === 0

  return NextResponse.json({ profile, isComplete, missingFields })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { location, businessType, businessName, specialties, targetAudience } = body

  // Validate all fields are provided and non-empty
  const updates: Record<string, string> = {}
  if (location?.trim()) updates.location = location.trim()
  if (businessType?.trim()) updates.businessType = businessType.trim()
  if (businessName?.trim()) updates.businessName = businessName.trim()
  if (specialties?.trim()) updates.specialties = specialties.trim()
  if (targetAudience?.trim()) updates.targetAudience = targetAudience.trim()

  await db.user.update({
    where: { id: user.id },
    data: updates,
  })

  // Return updated profile
  const updated = await db.user.findUnique({ where: { id: user.id } })
  const profile = {
    location: (updated as any).location || '',
    businessType: (updated as any).businessType || '',
    businessName: (updated as any).businessName || '',
    specialties: (updated as any).specialties || '',
    targetAudience: (updated as any).targetAudience || '',
  }

  const missingFields = REQUIRED_FIELDS.filter(f => !profile[f])
  const isComplete = missingFields.length === 0

  return NextResponse.json({ profile, isComplete, missingFields })
}
