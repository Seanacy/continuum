import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { searchInterests } from '@/lib/meta-ads';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const facebookAccountId = searchParams.get('facebookAccountId');

    if (!query || !facebookAccountId) {
      return NextResponse.json(
        { error: 'Missing required params: q, facebookAccountId' },
        { status: 400 }
      );
    }

    const fbAccount = await prisma.facebookAccount.findFirst({
      where: { id: facebookAccountId, userId: user.id, status: 'active' },
    });

    if (!fbAccount) {
      return NextResponse.json({ error: 'Facebook account not found' }, { status: 404 });
    }

    const results = await searchInterests(facebookAccountId, query);
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Interest search error:', error);
    return NextResponse.json({ error: error.message || 'Failed to search interests' }, { status: 500 });
  }
}
