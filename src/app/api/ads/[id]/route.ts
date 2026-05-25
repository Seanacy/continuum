import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdById, activateAd, pauseAd, deleteAd, getAdPerformance } from '@/lib/ad-engine';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const ad = await getAdById(params.id, user.id);
    if (!ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    }

    return NextResponse.json(ad);
  } catch (error: any) {
    console.error('Get ad error:', error);
    return NextResponse.json({ error: error.message || 'Failed to get ad' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'activate': {
        const result = await activateAd(params.id, user.id);
        return NextResponse.json(result);
      }
      case 'pause': {
        const result = await pauseAd(params.id, user.id);
        return NextResponse.json(result);
      }
      case 'refresh_metrics': {
        const metrics = await getAdPerformance(params.id, user.id);
        return NextResponse.json({ metrics });
      }
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: activate, pause, refresh_metrics' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Update ad error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update ad' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const result = await deleteAd(params.id, user.id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Delete ad error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete ad' }, { status: 500 });
  }
}
