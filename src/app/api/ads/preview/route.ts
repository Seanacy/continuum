import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdPreview, getReachEstimate, TargetingSpec } from '@/lib/meta-ads';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { facebookAccountId, creativeId, adFormat, targeting } = body;

    if (!facebookAccountId) {
      return NextResponse.json({ error: 'Missing facebookAccountId' }, { status: 400 });
    }

    const fbAccount = await db.facebookAccount.findFirst({
      where: { id: facebookAccountId, userId: user.id, status: 'active' },
    });

    if (!fbAccount) {
      return NextResponse.json({ error: 'Facebook account not found' }, { status: 404 });
    }

    const result: any = {};

    if (creativeId) {
      result.preview = await getAdPreview(
        facebookAccountId,
        creativeId,
        adFormat || 'DESKTOP_FEED_STANDARD'
      );
    }

    if (targeting && fbAccount.adAccountId) {
      result.reachEstimate = await getReachEstimate(
        facebookAccountId,
        fbAccount.adAccountId,
        targeting as TargetingSpec
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Preview error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate preview' }, { status: 500 });
  }
}
