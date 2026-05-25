import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdFromContent } from '@/lib/ad-engine';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { facebookAccountId, name, objective, content, targeting, budget, schedule } = body;

    if (!facebookAccountId || !name || !objective || !content || !targeting || !budget || !schedule) {
      return NextResponse.json(
        { error: 'Missing required fields: facebookAccountId, name, objective, content, targeting, budget, schedule' },
        { status: 400 }
      );
    }

    const result = await createAdFromContent({
      userId: user.id,
      facebookAccountId,
      name,
      objective,
      content,
      targeting,
      budget,
      schedule,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Ad creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create ad' },
      { status: 500 }
    );
  }
}
