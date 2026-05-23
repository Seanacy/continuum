import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getUserConnections } from '@/lib/proximity-engine'

export const dynamic = 'force-dynamic'

// GET — retrieve user's echo connections
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const connections = await getUserConnections(user.id)
    return NextResponse.json({ connections })
  } catch (err) {
    console.error('[ConnectionsAPI] GET failed:', err)
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }
}

// POST — accept or dismiss a connection
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { connectionId, action } = await req.json()

    if (!connectionId || !['accepted', 'dismissed'].includes(action)) {
      return NextResponse.json({ error: 'connectionId and action (accepted/dismissed) required' }, { status: 400 })
    }

    // Verify user is part of this connection
    const connection = await db.$queryRawUnsafe<Array<{ id: string; user_a_id: string; user_b_id: string }>>(
      "SELECT id, user_a_id, user_b_id FROM bubble_connections WHERE id = $1",
      connectionId
    )

    if (connection.length === 0) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const conn = connection[0]
    if (conn.user_a_id !== user.id && conn.user_b_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Update connection status
    await db.$executeRawUnsafe(
      "UPDATE bubble_connections SET status = $1, updated_at = NOW() WHERE id = $2",
      action, connectionId
    )

    // Log interaction
    await db.interaction.create({
      data: {
        userId: user.id,
        type: 'echo_connection_' + action,
        metadata: JSON.stringify({ connectionId }),
      },
    })

    return NextResponse.json({ success: true, action })
  } catch (err) {
    console.error('[ConnectionsAPI] POST failed:', err)
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 })
  }
}
