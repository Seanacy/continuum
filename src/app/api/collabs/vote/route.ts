import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ============================================
// POST — cast a vote on a collab proposal
// ============================================
// Works WITHOUT auth (anonymous public voters use fingerprint for dedup)
// Works WITH auth (logged-in users use their userId for dedup)
export async function POST(req: NextRequest) {
  try {
    const { proposalId, choice, fingerprint } = await req.json()

    if (!proposalId || !['a', 'b'].includes(choice)) {
      return NextResponse.json(
        { error: 'proposalId and choice (a or b) required' },
        { status: 400 }
      )
    }

    // Check proposal exists and is still cooking
    const proposals = await db.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT id, status FROM collab_proposals WHERE id = $1`,
      proposalId
    )

    if (proposals.length === 0) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    if (proposals[0].status !== 'cooking') {
      return NextResponse.json({ error: 'Voting is closed for this collab' }, { status: 400 })
    }

    // Try to get authenticated user (optional)
    let voterId: string | null = null
    try {
      const user = await getCurrentUser()
      if (user) voterId = user.id
    } catch {
      // Not logged in — that's fine for public voting
    }

    // Dedup check — prevent double voting
    if (voterId) {
      // Logged-in user: check by userId
      const existing = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM collab_votes WHERE proposal_id = $1 AND voter_id = $2`,
        proposalId, voterId
      )
      if (existing.length > 0) {
        return NextResponse.json({ error: 'You already voted on this collab' }, { status: 409 })
      }
    } else if (fingerprint) {
      // Anonymous user: check by fingerprint
      const existing = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM collab_votes WHERE proposal_id = $1 AND voter_fingerprint = $2`,
        proposalId, fingerprint
      )
      if (existing.length > 0) {
        return NextResponse.json({ error: 'You already voted on this collab' }, { status: 409 })
      }
    }

    // Cast the vote
    await db.$executeRawUnsafe(
      `INSERT INTO collab_votes (id, proposal_id, voter_id, choice, voter_fingerprint, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())`,
      proposalId,
      voterId,
      choice,
      fingerprint || null
    )

    // Update the vote count on the proposal
    const voteColumn = choice === 'a' ? 'votes_a' : 'votes_b'
    await db.$executeRawUnsafe(
      `UPDATE collab_proposals SET ${voteColumn} = ${voteColumn} + 1, updated_at = NOW() WHERE id = $1`,
      proposalId
    )

    // Return updated counts
    const updated = await db.$queryRawUnsafe<Array<{ votes_a: number; votes_b: number }>>(
      `SELECT votes_a, votes_b FROM collab_proposals WHERE id = $1`,
      proposalId
    )

    return NextResponse.json({
      success: true,
      votesA: updated[0]?.votes_a || 0,
      votesB: updated[0]?.votes_b || 0,
    })
  } catch (err) {
    console.error('[CollabVoteAPI] POST failed:', err)
    return NextResponse.json({ error: 'Failed to cast vote' }, { status: 500 })
  }
}
