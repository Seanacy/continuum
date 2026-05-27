// ============================================
// ORBIT AUTOMATION ENGINE
// Content Generation Pipeline & Publishing Queue
// ============================================

import { db } from '@/lib/db';
import { callLLM } from '@/lib/llm';
import { getOrbitStrategy } from '@/lib/orbit-strategy';

// ============================================
// TYPES
// ============================================

export interface AutomationConfig {
  projectId: string;
  userId: string;
  daysAhead: number; // how many days of content to generate
  autoSchedule: boolean; // auto-assign dates
  autoApprove: boolean; // skip approval queue
}

export interface GenerationResult {
  characterId: string;
  characterName: string;
  postsGenerated: number;
  postsScheduled: number;
  errors: string[];
}

export interface BatchResult {
  projectId: string;
  totalGenerated: number;
  totalScheduled: number;
  results: GenerationResult[];
  startedAt: Date;
  completedAt: Date;
}

export interface QueueItem {
  id: string;
  characterName: string;
  content: string;
  contentType: string;
  platform: string;
  scheduledFor: string | null;
  status: string;
  createdAt: string;
}

// ============================================
// POSTING FREQUENCY MAP
// ============================================

const POSTS_PER_WEEK: Record<string, number> = {
  '3x_daily': 21,
  '2x_daily': 14,
  daily: 7,
  '5x_week': 5,
  '3x_week': 3,
  '2x_week': 2,
  weekly: 1,
};

// ============================================
// OPTIMAL POSTING TIMES BY PLATFORM
// ============================================

const OPTIMAL_HOURS: Record<string, number[]> = {
  instagram: [9, 12, 17, 20],
  twitter: [8, 12, 15, 18, 21],
  tiktok: [10, 14, 19, 22],
  linkedin: [7, 10, 12, 17],
  youtube: [12, 15, 18],
  default: [9, 12, 17, 20],
};

// ============================================
// CONTENT TYPE ROTATION
// ============================================

const CONTENT_ROTATION: Record<string, string[]> = {
  thought_leader: ['thread', 'insight', 'analysis', 'opinion', 'case_study'],
  entertainer: ['meme', 'story', 'reaction', 'trend', 'challenge'],
  educator: ['tutorial', 'tip', 'explainer', 'breakdown', 'resource'],
  curator: ['roundup', 'review', 'comparison', 'spotlight', 'recommendation'],
  provocateur: ['hot_take', 'debate', 'challenge', 'prediction', 'contrarian'],
  community_builder: ['question', 'poll', 'shoutout', 'collaboration', 'behind_scenes'],
};

// ============================================
// GENERATE CONTENT BATCH
// ============================================

export async function generateContentBatch(
  config: AutomationConfig
): Promise<BatchResult> {
  const startedAt = new Date();
  const results: GenerationResult[] = [];
  let totalGenerated = 0;
  let totalScheduled = 0;

  // Get strategy for this project
  const strategy = await getOrbitStrategy(config.projectId, config.userId);

  // Get project with characters
  const project = await db.orbitProject.findFirst({
    where: { id: config.projectId, userId: config.userId },
    include: { characters: { where: { isActive: true } } },
  });

  if (!project) throw new Error('Project not found');

  // Generate content for each character based on their strategy
  for (const character of project.characters) {
    const charStrategy = strategy.find(
      (s: any) => s.characterId === character.id
    );
    if (!charStrategy || !charStrategy.automationEnabled) {
      results.push({
        characterId: character.id,
        characterName: character.name,
        postsGenerated: 0,
        postsScheduled: 0,
        errors: ['Automation disabled or no strategy'],
      });
      continue;
    }

    const result = await generateForCharacter(
      project,
      character,
      charStrategy,
      config
    );
    results.push(result);
    totalGenerated += result.postsGenerated;
    totalScheduled += result.postsScheduled;
  }

  return {
    projectId: config.projectId,
    totalGenerated,
    totalScheduled,
    results,
    startedAt,
    completedAt: new Date(),
  };
}

// ============================================
// GENERATE FOR SINGLE CHARACTER
// ============================================

async function generateForCharacter(
  project: any,
  character: any,
  strategy: any,
  config: AutomationConfig
): Promise<GenerationResult> {
  const errors: string[] = [];
  let postsGenerated = 0;
  let postsScheduled = 0;

  // Calculate how many posts needed
  const weeklyRate = POSTS_PER_WEEK[strategy.postingFrequency] || 3;
  const postsNeeded = Math.ceil((weeklyRate / 7) * config.daysAhead);

  // Get content types for this role
  const contentTypes =
    CONTENT_ROTATION[character.roleType] || CONTENT_ROTATION.thought_leader;

  // Get existing scheduled posts to avoid duplicates
  const existingPosts = await db.orbitPost.count({
    where: {
      characterId: character.id,
      status: { in: ['draft', 'scheduled', 'pending_approval'] },
    },
  });

  const actualNeeded = Math.max(0, postsNeeded - existingPosts);
  if (actualNeeded === 0) {
    return {
      characterId: character.id,
      characterName: character.name,
      postsGenerated: 0,
      postsScheduled: 0,
      errors: ['Sufficient content already queued'],
    };
  }

  // Generate posts
  for (let i = 0; i < actualNeeded; i++) {
    try {
      const contentType = contentTypes[i % contentTypes.length];
      const personality = character.personality as any;
      const contentProfile = character.contentProfile as any;

      const prompt = buildGenerationPrompt(
        character,
        strategy,
        contentType,
        personality,
        contentProfile,
        project
      );

      const response = await callLLM(
        prompt,
        [{ role: 'user', content: 'Generate the content now. Return ONLY the post text, no explanations.' }],
        { maxTokens: 500, temperature: 0.8 }
      );

      const content = response.content.trim();
      if (!content) {
        errors.push(`Empty response for post ${i + 1}`);
        continue;
      }

      // Determine schedule date
      let scheduledFor: Date | null = null;
      if (config.autoSchedule) {
        scheduledFor = calculateScheduleDate(
          i,
          weeklyRate,
          strategy.postingFrequency,
          contentProfile?.platforms?.[0] || 'default'
        );
      }

      // Create the post
      const status = config.autoApprove
        ? scheduledFor
          ? 'scheduled'
          : 'draft'
        : 'pending_approval';

      await db.orbitPost.create({
        data: {
          characterId: character.id,
          projectId: project.id,
          content,
          contentType,
          platform: contentProfile?.platforms?.[0] || 'instagram',
          status,
          scheduledFor,
          metadata: {
            generatedBy: 'automation',
            strategyRole: strategy.role,
            contentAngle: strategy.contentAngle,
            batchGenerated: true,
          } as any,
        },
      });

      postsGenerated++;
      if (scheduledFor) postsScheduled++;
    } catch (err: any) {
      errors.push(`Post ${i + 1}: ${err.message}`);
    }
  }

  return {
    characterId: character.id,
    characterName: character.name,
    postsGenerated,
    postsScheduled,
    errors,
  };
}

// ============================================
// BUILD GENERATION PROMPT
// ============================================

function buildGenerationPrompt(
  character: any,
  strategy: any,
  contentType: string,
  personality: any,
  contentProfile: any,
  project: any
): string {
  const themes = strategy.contentThemes?.join(', ') || 'general topics';
  const tone = personality?.tone || 'professional';
  const voice = personality?.voice || 'conversational';

  return `You are ${character.name}, a ${character.roleType} in the ${project.industry || 'general'} space.

Your content angle: ${strategy.contentAngle || 'general content'}
Your goal: ${strategy.goal || 'grow audience'}
Your tone: ${tone}
Your voice: ${voice}
Content themes: ${themes}

Generate a ${contentType} post for ${contentProfile?.platforms?.[0] || 'social media'}.

Target audience: ${project.targetAudience || 'general audience'}

Rules:
- Stay in character as ${character.name}
- Match the ${contentType} format
- Keep it authentic and engaging
- Include a hook in the first line
- End with engagement (question, CTA, or thought-provoker)
- Do NOT use hashtags unless they add real value
- Keep under 280 characters for tweets, under 2200 for Instagram`;
}

// ============================================
// CALCULATE SCHEDULE DATE
// ============================================

function calculateScheduleDate(
  postIndex: number,
  weeklyRate: number,
  frequency: string,
  platform: string
): Date {
  const now = new Date();
  const hoursGap = Math.floor((7 * 24) / weeklyRate);
  const postDate = new Date(now.getTime() + postIndex * hoursGap * 60 * 60 * 1000);

  // Snap to optimal posting hour
  const hours = OPTIMAL_HOURS[platform] || OPTIMAL_HOURS.default;
  const optimalHour = hours[postIndex % hours.length];
  postDate.setHours(optimalHour, 0, 0, 0);

  // Don't schedule in the past
  if (postDate < now) {
    postDate.setDate(postDate.getDate() + 1);
  }

  return postDate;
}

// ============================================
// GET PUBLISHING QUEUE
// ============================================

export async function getPublishingQueue(
  projectId: string,
  userId: string,
  filter?: 'all' | 'pending_approval' | 'scheduled' | 'draft'
): Promise<QueueItem[]> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error('Project not found');

  const where: any = { projectId };
  if (filter && filter !== 'all') {
    where.status = filter;
  } else {
    where.status = { in: ['draft', 'scheduled', 'pending_approval'] };
  }

  const posts = await db.orbitPost.findMany({
    where,
    include: { character: { select: { name: true } } },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return posts.map((post: any) => ({
    id: post.id,
    characterName: post.character?.name || 'Unknown',
    content: post.content,
    contentType: post.contentType || 'post',
    platform: post.platform || 'instagram',
    scheduledFor: post.scheduledFor?.toISOString() || null,
    status: post.status,
    createdAt: post.createdAt.toISOString(),
  }));
}

// ============================================
// APPROVE / REJECT QUEUE ITEMS
// ============================================

export async function approveQueueItem(
  postId: string,
  userId: string,
  action: 'approve' | 'reject' | 'reschedule',
  scheduledFor?: Date
): Promise<void> {
  const post = await db.orbitPost.findFirst({
    where: { id: postId },
    include: { project: { select: { userId: true } } },
  });

  if (!post || (post.project as any).userId !== userId) {
    throw new Error('Post not found or unauthorized');
  }

  if (action === 'approve') {
    await db.orbitPost.update({
      where: { id: postId },
      data: {
        status: scheduledFor ? 'scheduled' : 'draft',
        scheduledFor: scheduledFor || post.scheduledFor,
      },
    });
  } else if (action === 'reject') {
    await db.orbitPost.update({
      where: { id: postId },
      data: { status: 'rejected' },
    });
  } else if (action === 'reschedule' && scheduledFor) {
    await db.orbitPost.update({
      where: { id: postId },
      data: { status: 'scheduled', scheduledFor },
    });
  }
}

// ============================================
// BULK APPROVE ALL PENDING
// ============================================

export async function bulkApprove(
  projectId: string,
  userId: string
): Promise<number> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error('Project not found');

  const result = await db.orbitPost.updateMany({
    where: {
      projectId,
      status: 'pending_approval',
    },
    data: { status: 'scheduled' },
  });

  return result.count;
}

// ============================================
// GET AUTOMATION STATUS
// ============================================

export async function getAutomationStatus(
  projectId: string,
  userId: string
): Promise<{
  totalDrafts: number;
  totalScheduled: number;
  totalPending: number;
  nextScheduled: string | null;
  charactersAutomated: number;
  charactersTotal: number;
}> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
    include: { characters: { where: { isActive: true } } },
  });
  if (!project) throw new Error('Project not found');

  const strategy = await getOrbitStrategy(projectId, userId);
  const automatedCount = strategy.filter((s: any) => s.automationEnabled).length;

  const [drafts, scheduled, pending, nextPost] = await Promise.all([
    db.orbitPost.count({ where: { projectId, status: 'draft' } }),
    db.orbitPost.count({ where: { projectId, status: 'scheduled' } }),
    db.orbitPost.count({ where: { projectId, status: 'pending_approval' } }),
    db.orbitPost.findFirst({
      where: { projectId, status: 'scheduled', scheduledFor: { gte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      select: { scheduledFor: true },
    }),
  ]);

  return {
    totalDrafts: drafts,
    totalScheduled: scheduled,
    totalPending: pending,
    nextScheduled: nextPost?.scheduledFor?.toISOString() || null,
    charactersAutomated: automatedCount,
    charactersTotal: project.characters.length,
  };
}
