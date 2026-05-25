import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { refreshAllUserAdMetrics } from '@/lib/ad-engine';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const results = await refreshAllUserAdMetrics(user.id);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Refresh metrics error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh metrics' },
      { status: 500 }
    );
  }
}
