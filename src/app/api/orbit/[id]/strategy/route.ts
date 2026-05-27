import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getOrbitStrategy,
  updateOrbitStrategy,
  updateCharacterStrategy,
  suggestStrategy,
  applySuggestions,
} from '@/lib/orbit-strategy';

// ============================================
// GET /api/orbit/[id]/strategy
// Fetch the strategy table for a project
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

    const strategy = await getOrbitStrategy(params.id, user.id);
    return NextResponse.json(strategy);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch strategy' },
      { status: 500 }
    );
  }
}

// ============================================
// PUT /api/orbit/[id]/strategy
// Update the full strategy table
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { entries } = body;

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: 'entries array is required' },
        { status: 400 }
      );
    }

    const strategy = await updateOrbitStrategy(params.id, user.id, entries);
    return NextResponse.json(strategy);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update strategy' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH /api/orbit/[id]/strategy
// Update a single character's strategy or get AI suggestions
// ============================================

export async function PATCH(
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

    // AI suggestion flow
    if (action === 'suggest') {
      const suggestions = await suggestStrategy(params.id, user.id);
      return NextResponse.json({ suggestions });
    }

    // Apply suggestions flow
    if (action === 'apply_suggestions') {
      const { suggestions } = body;
      if (!suggestions || !Array.isArray(suggestions)) {
        return NextResponse.json(
          { error: 'suggestions array is required' },
          { status: 400 }
        );
      }
      const strategy = await applySuggestions(params.id, user.id, suggestions);
      return NextResponse.json(strategy);
    }

    // Single character update flow
    const { characterId, updates } = body;
    if (!characterId) {
      return NextResponse.json(
        { error: 'characterId is required' },
        { status: 400 }
      );
    }

    const strategy = await updateCharacterStrategy(
      params.id,
      user.id,
      characterId,
      updates || {}
    );
    return NextResponse.json(strategy);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update strategy' },
      { status: 500 }
    );
  }
}
