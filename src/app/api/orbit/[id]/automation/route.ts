// ============================================
// ORBIT AUTOMATION API ROUTE
// Batch generation, publishing queue, approvals
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  generateContentBatch,
  getPublishingQueue,
  approveQueueItem,
  bulkApprove,
  getAutomationStatus
} from '@/lib/orbit-automation';

// ============================================
// GET — Fetch queue or automation status
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'queue';
    const projectId = params.id;

    if (action === 'status') {
      const status = await getAutomationStatus(projectId, user.id);
      return NextResponse.json(status);
    }

    // Default: get publishing queue
    const statusFilter = searchParams.get('status') || undefined;
    const queue = await getPublishingQueue(projectId, user.id, statusFilter);
    return NextResponse.json({ queue });
  } catch (error: any) {
    console.error('Automation GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch automation data' },
      { status: 500 }
    );
  }
}

// ============================================
// POST — Generate batch or approve items
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    const projectId = params.id;

    // ----------------------------------------
    // Generate a week of content
    // ----------------------------------------
    if (action === 'generate') {
      const { config } = body;
      const result = await generateContentBatch(projectId, user.id, config);
      return NextResponse.json(result);
    }

    // ----------------------------------------
    // Approve a single queue item
    // ----------------------------------------
    if (action === 'approve') {
      const { contentId } = body;
      if (!contentId) {
        return NextResponse.json(
          { error: 'contentId is required' },
          { status: 400 }
        );
      }
      const item = await approveQueueItem(projectId, user.id, contentId, 'approved');
      return NextResponse.json({ item });
    }

    // ----------------------------------------
    // Reject a single queue item
    // ----------------------------------------
    if (action === 'reject') {
      const { contentId } = body;
      if (!contentId) {
        return NextResponse.json(
          { error: 'contentId is required' },
          { status: 400 }
        );
      }
      const item = await approveQueueItem(projectId, user.id, contentId, 'rejected');
      return NextResponse.json({ item });
    }

    // ----------------------------------------
    // Bulk approve all pending items
    // ----------------------------------------
    if (action === 'bulk-approve') {
      const count = await bulkApprove(projectId, user.id);
      return NextResponse.json({ approved: count });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Automation POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process automation action' },
      { status: 500 }
    );
  }
}
