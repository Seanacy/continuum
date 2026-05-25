import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listUserAds } from '@/lib/ad-engine';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const result = await listUserAds(user.id, status, page, pageSize);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('List ads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list ads' },
      { status: 500 }
    );
  }
}
