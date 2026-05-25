import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ContentPipeline, PipelineConfig } from '@/lib/content-pipeline';
import { getQuotaStats } from '@/lib/image-quota';

// Store active pipelines in memory (per-request on serverless, but works for sequential calls)
const activePipelines = new Map<string, ContentPipeline>();

function getPipelineKey(userId: string, characterId: string) {
  return `${userId}:${characterId}`;
}

// POST /api/content-pipeline — start a new pipeline or take an action
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { action, characterId, autoMode, ideaCount, photosPerIdea, photoUrl } = body;

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    const key = getPipelineKey(user.id, characterId);

    switch (action) {
      case 'start': {
        // Create and start a new pipeline
        const config: PipelineConfig = {
          userId: user.id,
          characterId,
          autoMode: autoMode ?? false,
          ideaCount: ideaCount ?? 5,
          photosPerIdea: photosPerIdea ?? 6,
        };

        const pipeline = new ContentPipeline(config);
        activePipelines.set(key, pipeline);

        const state = await pipeline.start();
        return NextResponse.json({ success: true, state });
      }

      case 'approve_photo': {
        const pipeline = activePipelines.get(key);
        if (!pipeline) {
          return NextResponse.json({ error: 'No active pipeline. Start one first.' }, { status: 400 });
        }
        if (!photoUrl) {
          return NextResponse.json({ error: 'photoUrl is required' }, { status: 400 });
        }

        const state = await pipeline.approvePhoto(photoUrl);
        return NextResponse.json({ success: true, state });
      }

      case 'reject_photo': {
        const pipeline = activePipelines.get(key);
        if (!pipeline) {
          return NextResponse.json({ error: 'No active pipeline. Start one first.' }, { status: 400 });
        }

        const state = pipeline.rejectPhoto();
        return NextResponse.json({ success: true, state });
      }

      case 'skip_idea': {
        const pipeline = activePipelines.get(key);
        if (!pipeline) {
          return NextResponse.json({ error: 'No active pipeline. Start one first.' }, { status: 400 });
        }

        const state = pipeline.skipIdea();
        return NextResponse.json({ success: true, state });
      }

      default:
        return NextResponse.json({ error: 'Invalid action. Use: start, approve_photo, reject_photo, skip_idea' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[content-pipeline] Error:', error);
    return NextResponse.json({ error: error.message || 'Pipeline error' }, { status: 500 });
  }
}

// GET /api/content-pipeline — get current pipeline state or quota info
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');
    const info = searchParams.get('info');

    // GET /api/content-pipeline?info=quota — return quota stats
    if (info === 'quota') {
      const stats = await getQuotaStats();
      return NextResponse.json({ success: true, quota: stats });
    }

    // GET /api/content-pipeline?characterId=xxx — return pipeline state
    if (!characterId) {
      return NextResponse.json({ error: 'characterId query param required' }, { status: 400 });
    }

    const key = getPipelineKey(user.id, characterId);
    const pipeline = activePipelines.get(key);

    if (!pipeline) {
      return NextResponse.json({ success: true, state: null, message: 'No active pipeline' });
    }

    const state = pipeline.getState();
    const currentCandidate = pipeline.getCurrentCandidate();

    return NextResponse.json({
      success: true,
      state,
      currentCandidate,
    });
  } catch (error: any) {
    console.error('[content-pipeline] GET Error:', error);
    return NextResponse.json({ error: error.message || 'Error fetching pipeline state' }, { status: 500 });
  }
}
