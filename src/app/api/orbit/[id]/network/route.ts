import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getOrbitNetwork, updateOrbitRelationship } from '@/lib/orbit-network';

// ============================================
// GET /api/orbit/[id]/network
// Returns network graph data for visualization
// ============================================

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const network = await getOrbitNetwork(params.id, user.id);
    return NextResponse.json(network);
  } catch (error) {
    console.error('Error fetching orbit network:', error);
    return NextResponse.json(
      { error: 'Failed to fetch network data' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH /api/orbit/[id]/network
// Update a relationship dynamic
// ============================================

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { relationshipId, dynamic } = await request.json();

    if (!relationshipId || !dynamic) {
      return NextResponse.json(
        { error: 'relationshipId and dynamic are required' },
        { status: 400 }
      );
    }

    const result = await updateOrbitRelationship(
      params.id,
      user.id,
      relationshipId,
      dynamic
    );

    if (!result.success) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating relationship:', error);
    return NextResponse.json(
      { error: 'Failed to update relationship' },
      { status: 500 }
    );
  }
}
