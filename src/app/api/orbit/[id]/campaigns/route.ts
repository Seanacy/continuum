import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  createCampaign,
  getCampaigns,
  getCampaignWithPosts,
  generateCampaignPosts,
  updateCampaignStatus,
  deleteCampaign,
} from '@/lib/orbit-campaigns'

// ============================================
// GET — List campaigns or get single campaign
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')

    if (campaignId) {
      const campaign = await getCampaignWithPosts(campaignId)
      return NextResponse.json(campaign)
    }

    const campaigns = await getCampaigns(params.id)
    return NextResponse.json({ campaigns })
  } catch (error: any) {
    console.error('Campaign GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch campaigns' },
      { status: 500 }
    )
  }
}

// ============================================
// POST — Create campaign or generate posts
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'generate_posts') {
      const { campaignId } = body
      if (!campaignId) {
        return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
      }
      const posts = await generateCampaignPosts(campaignId)
      return NextResponse.json({ success: true, postsCreated: posts.length, posts })
    }

    const { name, goal, durationDays, platforms, startDate } = body

    if (!name || !goal) {
      return NextResponse.json(
        { error: 'name and goal are required' },
        { status: 400 }
      )
    }

    const result = await createCampaign(params.id, user.id, {
      name,
      goal,
      durationDays: durationDays || 7,
      platforms: platforms || ['twitter'],
      startDate,
    })

    return NextResponse.json({
      success: true,
      campaign: result.campaign,
      brief: result.brief,
    })
  } catch (error: any) {
    console.error('Campaign POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

// ============================================
// PUT — Update campaign status
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { campaignId, status } = body

    if (!campaignId || !status) {
      return NextResponse.json(
        { error: 'campaignId and status required' },
        { status: 400 }
      )
    }

    const result = await updateCampaignStatus(campaignId, status)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Campaign PUT error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update campaign' },
      { status: 500 }
    )
  }
}

// ============================================
// DELETE — Delete campaign and its posts
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }

    const result = await deleteCampaign(campaignId)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Campaign DELETE error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete campaign' },
      { status: 500 }
    )
  }
}
