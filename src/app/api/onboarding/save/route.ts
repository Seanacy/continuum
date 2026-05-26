import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { addFunds } from '@/lib/credit-system'

const ONBOARDING_BONUS_CENTS = 100 // $1.00 free to explore after onboarding

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { aiName, business, personal } = await req.json()

    // Check if this is the first onboarding (not a Settings link scan)
    const isFirstOnboarding = aiName && !(user as any).onboardingComplete

    // 1. Update user profile — AI name + personal info + mark onboarding complete
    const userUpdate: Record<string, any> = {
      onboardingComplete: true,
    }
    if (aiName) userUpdate.aiName = aiName
    if (personal?.name) userUpdate.name = personal.name
    if (personal?.location) userUpdate.location = personal.location

    await db.user.update({
      where: { id: user.id },
      data: userUpdate,
    })

    // 1b. Give new users a free $1.00 to explore content generation
    if (isFirstOnboarding) {
      try {
        await addFunds(user.id, ONBOARDING_BONUS_CENTS, {
          reason: 'Welcome bonus — free credits for completing onboarding',
        })
      } catch {
        // Non-critical — don't block onboarding if this fails
      }
    }

    // 2. Create business if we have business data
    if (business?.name) {
      await db.business.create({
        data: {
          userId: user.id,
          name: business.name,
          websiteUrl: business.websiteUrl || null,
          businessType: business.businessType || null,
          productsServices: business.productsServices || null,
          targetAudience: business.targetAudience || null,
          brandVoice: business.brandVoice || null,
          location: business.location || null,
          socialLinks: business.socialLinks || [],
          scrapedData: business,
        },
      })
    }

    // 3. Save personal info as memories so the AI knows about the user
    const personalFacts: string[] = []
    if (personal?.background) personalFacts.push(`Background: ${personal.background}`)
    if (personal?.personality) personalFacts.push(`Personality: ${personal.personality}`)
    if (personal?.interests?.length) personalFacts.push(`Interests: ${personal.interests.join(', ')}`)
    if (personal?.funFacts?.length) personalFacts.push(`Fun facts: ${personal.funFacts.join(', ')}`)

    if (personalFacts.length > 0) {
      await db.memory.create({
        data: {
          userId: user.id,
          content: `[Link Scan] What I learned about this person from their links:\n${personalFacts.join('\n')}`,
          type: 'insight',
          weight: 8,
        },
      })
    }

    // 4. Also save business info as a memory
    if (business?.name) {
      const bizFacts: string[] = []
      bizFacts.push(`Business name: ${business.name}`)
      if (business.businessType) bizFacts.push(`Type: ${business.businessType}`)
      if (business.productsServices) bizFacts.push(`Products/Services: ${business.productsServices}`)
      if (business.targetAudience) bizFacts.push(`Target audience: ${business.targetAudience}`)
      if (business.brandVoice) bizFacts.push(`Brand voice: ${business.brandVoice}`)

      await db.memory.create({
        data: {
          userId: user.id,
          content: `[Link Scan] What I learned about their business from their links:\n${bizFacts.join('\n')}`,
          type: 'insight',
          weight: 9,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Onboarding save error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
