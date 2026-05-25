import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/businesses — list all businesses for logged-in user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const businesses = await db.business.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ businesses });
  } catch (err) {
    console.error('GET /api/businesses error:', err);
    return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 });
  }
}

// POST /api/businesses — create a new business
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, websiteUrl, businessType, productsServices, targetAudience, socialLinks, location, brandVoice, scrapedData } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
    }

    const business = await db.business.create({
      data: {
        userId: user.id,
        name: name.trim(),
        websiteUrl: websiteUrl || null,
        businessType: businessType || null,
        productsServices: productsServices || null,
        targetAudience: targetAudience || null,
        socialLinks: socialLinks || [],
        location: location || null,
        brandVoice: brandVoice || null,
        scrapedData: scrapedData || null,
      },
    });

    return NextResponse.json({ business }, { status: 201 });
  } catch (err) {
    console.error('POST /api/businesses error:', err);
    return NextResponse.json({ error: 'Failed to create business' }, { status: 500 });
  }
}

// PUT /api/businesses — update an existing business
export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await db.business.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Only allow updating known fields
    const allowed: Record<string, any> = {};
    const fields = ['name', 'websiteUrl', 'businessType', 'productsServices', 'targetAudience', 'socialLinks', 'location', 'brandVoice', 'scrapedData'];
    for (const f of fields) {
      if (updates[f] !== undefined) allowed[f] = updates[f];
    }

    const business = await db.business.update({
      where: { id },
      data: allowed,
    });

    return NextResponse.json({ business });
  } catch (err) {
    console.error('PUT /api/businesses error:', err);
    return NextResponse.json({ error: 'Failed to update business' }, { status: 500 });
  }
}

// DELETE /api/businesses — delete a business
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await db.business.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    await db.business.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/businesses error:', err);
    return NextResponse.json({ error: 'Failed to delete business' }, { status: 500 });
  }
}
