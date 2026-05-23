import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ============================================
// GET — fetch collab proposals
// ============================================
// ?status=cooking (default) — active collabs
// ?mine=true — only collabs involving the current user
// ?public=true — all cooking collabs (for public /cooking page, no auth needed)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'cooking'
  const isPublic = searchParams.get('public') === 'true'
  const isMine = searchParams.get('mine') === 'true'

  try {
    // Public mode — no auth needed, returns all cooking collabs
    if (isPublic) {
      const collabs = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT cp.id, cp.title, cp.description, cp.option_a, cp.option_b,
                cp.votes_a, cp.votes_b, cp.status, cp.created_at,
                ua.name as user_a_name, ub.name as user_b_name
         FROM collab_proposals cp
         JOIN users ua ON ua.id = cp.user_a_id
         JOIN users ub ON ub.id = cp.user_b_id
         WHERE cp.status = $1
         ORDER BY (cp.votes_a + cp.votes_b) DESC, cp.created_at DESC
         LIMIT 50`,
        status
      )
      return NextResponse.json({ collabs, public: true })
    }

    // Authenticated modes
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (isMine) {
      // Collabs involving this user
      const collabs = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT cp.id, cp.title, cp.description, cp.option_a, cp.option_b,
                cp.votes_a, cp.votes_b, cp.status, cp.accepted_by_a, cp.accepted_by_b,
                cp.created_at, cp.user_a_id, cp.user_b_id,
                ua.name as user_a_name, ub.name as user_b_name
         FROM collab_proposals cp
         JOIN users ua ON ua.id = cp.user_a_id
         JOIN users ub ON ub.id = cp.user_b_id
         WHERE (cp.user_a_id = $1 OR cp.user_b_id = $1)
         ORDER BY cp.created_at DESC
         LIMIT 20`,
        user.id
      )
      return NextResponse.json({ collabs })
    }

    // Default: all cooking collabs (authenticated)
    const collabs = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT cp.id, cp.title, cp.description, cp.option_a, cp.option_b,
              cp.votes_a, cp.votes_b, cp.status, cp.created_at,
              ua.name as user_a_name, ub.name as user_b_name
       FROM collab_proposals cp
       JOIN users ua ON ua.id = cp.user_a_id
       JOIN users ub ON ub.id = cp.user_b_id
       WHERE cp.status = $1
       ORDER BY (cp.votes_a + cp.votes_b) DESC, cp.created_at DESC
       LIMIT 50`,
      status
    )

    // Also check if there are ANY cooking collabs (for the button visibility)
    const countResult = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) as count FROM collab_proposals WHERE status = 'cooking'`
    )
    const cookingCount = parseInt(countResult[0]?.count || '0', 10)

    return NextResponse.json({ collabs, cookingCount })
  } catch (err) {
    console.error('[CollabsAPI] GET failed:', err)
    return NextResponse.json({ error: 'Failed to fetch collabs' }, { status: 500 })
  }
}

// ============================================
// POST — accept or reject a collab proposal
// ============================================
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { proposalId, action } = await req.json()

    if (!proposalId || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'proposalId and action (accept/reject) required' }, { status: 400 })
    }

    // Fetch the proposal
    const proposals = await db.$queryRawUnsafe<Array<{
      id: string; user_a_id: string; user_b_id: string;
      accepted_by_a: boolean; accepted_by_b: boolean; status: string
    }>>(
      `SELECT id, user_a_id, user_b_id, accepted_by_a, accepted_by_b, status
       FROM collab_proposals WHERE id = $1`,
      proposalId
    )

    if (proposals.length === 0) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    const proposal = proposals[0]

    // Verify user is part of this proposal
    const isUserA = proposal.user_a_id === user.id
    const isUserB = proposal.user_b_id === user.id
    if (!isUserA && !isUserB) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (action === 'reject') {
      // Cancel the proposal
      await db.$executeRawUnsafe(
        `UPDATE collab_proposals SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        proposalId
      )
      return NextResponse.json({ success: true, action: 'rejected' })
    }

    // Accept — update the right flag
    if (isUserA) {
      await db.$executeRawUnsafe(
        `UPDATE collab_proposals SET accepted_by_a = true, updated_at = NOW() WHERE id = $1`,
        proposalId
      )
    } else {
      await db.$executeRawUnsafe(
        `UPDATE collab_proposals SET accepted_by_b = true, updated_at = NOW() WHERE id = $1`,
        proposalId
      )
    }

    // Check if both have now accepted
    const updated = await db.$queryRawUnsafe<Array<{ accepted_by_a: boolean; accepted_by_b: boolean }>>(
      `SELECT accepted_by_a, accepted_by_b FROM collab_proposals WHERE id = $1`,
      proposalId
    )

    const bothAccepted = updated[0]?.accepted_by_a && updated[0]?.accepted_by_b

    return NextResponse.json({
      success: true,
      action: 'accepted',
      bothAccepted,
    })
  } catch (err) {
    console.error('[CollabsAPI] POST failed:', err)
    return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 })
  }
}
