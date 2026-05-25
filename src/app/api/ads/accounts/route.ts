import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserAdAccountHealth } from '@/lib/ad-engine';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const accounts = await getUserAdAccountHealth(user.id);
    return NextResponse.json({ accounts });
  } catch (error: any) {
    console.error('Get ad accounts error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get accounts' },
      { status: 500 }
    );
  }
}
