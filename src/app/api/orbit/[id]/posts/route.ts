// ============================================
// ORBIT POSTS API — CRUD for OrbitPost records
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// ============================================
// GET — List posts for a project with filtering
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = params;

    // Verify project ownership
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true }
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Parse query params for filtering
    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get('characterId');
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');
    const contentType = searchParams.get('contentType');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause
    const where: any = { projectId };
    if (characterId) where.characterId = characterId;
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;

    // Get total count for pagination
    const total = await db.orbitPost.count({ where });

    // Get posts with character info
    const posts = await db.orbitPost.findMany({
      where,
      include: {
        character: {
          select: { id: true, name: true, roleType: true, username: true }
        }
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit
    });

    // Get aggregate stats
    const stats = await db.orbitPost.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { id: true }
    });

    const statusCounts: Record<string, number> = {};
    stats.forEach((s: any) => { statusCounts[s.status] = s._count.id; });

    return NextResponse.json({
      posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: statusCounts
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

// ============================================
// PUT — Update a post (edit content, change status)
// ============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = params;
    const body = await request.json();
    const { postId, content, status, scheduledFor, platform, contentType } = body;

    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

    // Verify project ownership
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true }
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Build update data
    const updateData: any = { updatedAt: new Date() };
    if (content !== undefined) updateData.content = content;
    if (platform !== undefined) updateData.platform = platform;
    if (contentType !== undefined) updateData.contentType = contentType;
    if (scheduledFor !== undefined) updateData.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;

    // Handle status transitions
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approvedAt = new Date();
        updateData.approvedBy = user.id;
      } else if (status === 'published') {
        updateData.publishedAt = new Date();
        if (!updateData.approvedAt) {
          updateData.approvedAt = new Date();
          updateData.approvedBy = user.id;
        }
      } else if (status === 'rejected') {
        updateData.approvedAt = null;
        updateData.approvedBy = null;
      }
    }

    const updated = await db.orbitPost.update({
      where: { id: postId },
      data: updateData,
      include: {
        character: {
          select: { id: true, name: true, roleType: true, username: true }
        }
      }
    });

    return NextResponse.json({ post: updated });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

// ============================================
// POST — Bulk actions (approve, reject, publish, delete)
// ============================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = params;
    const body = await request.json();
    const { action, postIds } = body;

    if (!action || !postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ error: 'action and postIds[] required' }, { status: 400 });
    }

    // Verify project ownership
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true }
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    let result;

    switch (action) {
      case 'approve':
        result = await db.orbitPost.updateMany({
          where: { id: { in: postIds }, projectId },
          data: { status: 'approved', approvedAt: new Date(), approvedBy: user.id, updatedAt: new Date() }
        });
        break;

      case 'reject':
        result = await db.orbitPost.updateMany({
          where: { id: { in: postIds }, projectId },
          data: { status: 'rejected', updatedAt: new Date() }
        });
        break;

      case 'publish':
        result = await db.orbitPost.updateMany({
          where: { id: { in: postIds }, projectId },
          data: {
            status: 'published',
            publishedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: user.id,
            updatedAt: new Date()
          }
        });
        break;

      case 'delete':
        result = await db.orbitPost.deleteMany({
          where: { id: { in: postIds }, projectId }
        });
        break;

      case 'schedule':
        const { scheduledFor: scheduleDate } = body;
        if (!scheduleDate) return NextResponse.json({ error: 'scheduledFor required for schedule action' }, { status: 400 });
        result = await db.orbitPost.updateMany({
          where: { id: { in: postIds }, projectId },
          data: { status: 'scheduled', scheduledFor: new Date(scheduleDate), updatedAt: new Date() }
        });
        break;

      case 'draft':
        result = await db.orbitPost.updateMany({
          where: { id: { in: postIds }, projectId },
          data: { status: 'draft', scheduledFor: null, approvedAt: null, approvedBy: null, updatedAt: new Date() }
        });
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ action, count: result.count || postIds.length, success: true });
  } catch (error) {
    console.error('Error performing bulk action:', error);
    return NextResponse.json({ error: 'Failed to perform bulk action' }, { status: 500 });
  }
}

// ============================================
// DELETE — Delete a single post
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = params;
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

    // Verify project ownership
    const project = await db.orbitProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true }
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    await db.orbitPost.delete({ where: { id: postId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
