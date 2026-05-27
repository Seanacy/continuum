// ============================================
// ORBIT STRATEGY ENGINE
// Strategy Builder & Network Automation
// ============================================

import { db } from '@/lib/db';
import { callLLM } from '@/lib/llm';

// ============================================
// TYPES
// ============================================

export interface StrategyEntry {
  characterId: string;
  characterName: string;
  role: string;
  contentAngle: string;
  goal: string;
  postingFrequency: string;
  contentThemes: string[];
  interactionRules: string[];
  automationEnabled: boolean;
}

export interface StrategyTable {
  entries: StrategyEntry[];
  lastUpdated: string;
  version: number;
}

export interface StrategySuggestion {
  characterId: string;
  suggestions: {
    contentAngle: string;
    goal: string;
    postingFrequency: string;
    contentThemes: string[];
    interactionRules: string[];
    reasoning: string;
  };
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_POSTING_FREQUENCIES = [
  'daily',
  'twice_daily',
  'every_other_day',
  'weekly',
  'twice_weekly',
  'three_times_weekly',
];

const ROLE_STRATEGY_DEFAULTS: Record<string, {
  contentThemes: string[];
  interactionRules: string[];
  postingFrequency: string;
}> = {
  thought_leader: {
    contentThemes: ['industry insights', 'hot takes', 'trend analysis', 'predictions'],
    interactionRules: ['engage with comments thoughtfully', 'share other thought leaders content with commentary', 'start debates on trending topics'],
    postingFrequency: 'daily',
  },
  entertainer: {
    contentThemes: ['memes', 'humor', 'trending audio', 'relatable content', 'behind the scenes'],
    interactionRules: ['reply with humor', 'create duets and stitches', 'engage in playful banter with other characters'],
    postingFrequency: 'twice_daily',
  },
  educator: {
    contentThemes: ['tutorials', 'how-tos', 'explainers', 'myth busting', 'tips and tricks'],
    interactionRules: ['answer questions in detail', 'create follow-up content from comments', 'collaborate with other educators'],
    postingFrequency: 'every_other_day',
  },
  curator: {
    contentThemes: ['roundups', 'recommendations', 'reviews', 'comparisons', 'best of lists'],
    interactionRules: ['credit original creators', 'ask audience for suggestions', 'create themed collections'],
    postingFrequency: 'three_times_weekly',
  },
  provocateur: {
    contentThemes: ['controversial takes', 'unpopular opinions', 'challenge the norm', 'debate starters'],
    interactionRules: ['engage with critics respectfully', 'double down on takes with evidence', 'create response content'],
    postingFrequency: 'daily',
  },
  community_builder: {
    contentThemes: ['community spotlights', 'user generated content', 'polls and questions', 'live sessions', 'challenges'],
    interactionRules: ['respond to every comment', 'feature community members', 'host regular interactive events'],
    postingFrequency: 'daily',
  },
};

// ============================================
// GET STRATEGY
// ============================================

export async function getOrbitStrategy(
  projectId: string,
  userId: string
): Promise<StrategyTable> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
    include: {
      characters: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const rawStrategy = (project as any).strategyTable;

  // If strategy table exists and is properly formatted, return it
  if (rawStrategy && Array.isArray(rawStrategy) && rawStrategy.length > 0) {
    if (rawStrategy[0]?.characterId) {
      return {
        entries: rawStrategy as StrategyEntry[],
        lastUpdated: new Date().toISOString(),
        version: 1,
      };
    }
  }

  // Build default strategy from characters
  const entries: StrategyEntry[] = project.characters.map((char: any) => {
    const roleDefaults = ROLE_STRATEGY_DEFAULTS[char.roleType] || ROLE_STRATEGY_DEFAULTS.thought_leader;
    return {
      characterId: char.id,
      characterName: char.name,
      role: char.roleType,
      contentAngle: char.contentAngle || '',
      goal: char.goal || '',
      postingFrequency: roleDefaults.postingFrequency,
      contentThemes: roleDefaults.contentThemes,
      interactionRules: roleDefaults.interactionRules,
      automationEnabled: false,
    };
  });

  return {
    entries,
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
}

// ============================================
// UPDATE STRATEGY
// ============================================

export async function updateOrbitStrategy(
  projectId: string,
  userId: string,
  entries: StrategyEntry[]
): Promise<StrategyTable> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  for (const entry of entries) {
    if (!entry.characterId || !entry.role) {
      throw new Error('Each strategy entry needs a characterId and role');
    }
  }

  await db.orbitProject.update({
    where: { id: projectId },
    data: {
      strategyTable: entries as any,
    },
  });

  return {
    entries,
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
}

// ============================================
// UPDATE SINGLE CHARACTER STRATEGY
// ============================================

export async function updateCharacterStrategy(
  projectId: string,
  userId: string,
  characterId: string,
  updates: Partial<StrategyEntry>
): Promise<StrategyTable> {
  const strategy = await getOrbitStrategy(projectId, userId);

  const entryIndex = strategy.entries.findIndex(
    (e) => e.characterId === characterId
  );

  if (entryIndex === -1) {
    throw new Error('Character not found in strategy table');
  }

  strategy.entries[entryIndex] = {
    ...strategy.entries[entryIndex],
    ...updates,
    characterId,
  };

  return updateOrbitStrategy(projectId, userId, strategy.entries);
}

// ============================================
// AI STRATEGY SUGGESTIONS
// ============================================

export async function suggestStrategy(
  projectId: string,
  userId: string
): Promise<StrategySuggestion[]> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
    include: {
      characters: {
        where: { isActive: true },
        include: {
          relationshipsAsA: true,
          relationshipsAsB: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const characterSummaries = project.characters.map((char: any) => ({
    id: char.id,
    name: char.name,
    role: char.roleType,
    personality: char.personality,
    contentAngle: char.contentAngle,
    goal: char.goal,
    relationships: [
      ...char.relationshipsAsA.map((r: any) => r.relationshipType),
      ...char.relationshipsAsB.map((r: any) => r.relationshipType),
    ],
  }));

  const prompt = `You are a social media strategist for an AI influencer network.

Project: ${project.name}
Industry: ${project.industry || 'general'}
Target Audience: ${project.targetAudience || 'general'}
Objective: ${project.objective || 'grow audience'}

Characters in the network:
${JSON.stringify(characterSummaries, null, 2)}

For each character, suggest an optimized content strategy. Return a JSON array with this exact structure:
[
  {
    "characterId": "the character id",
    "suggestions": {
      "contentAngle": "specific angle this character should take",
      "goal": "measurable goal for this character",
      "postingFrequency": "one of: daily, twice_daily, every_other_day, weekly, twice_weekly, three_times_weekly",
      "contentThemes": ["theme1", "theme2", "theme3", "theme4"],
      "interactionRules": ["rule1", "rule2", "rule3"],
      "reasoning": "why this strategy works for this character"
    }
  }
]

Consider how the characters can play off each other based on their relationships. Make suggestions specific and actionable, not generic. Return ONLY the JSON array, no other text.`;

  const response = await callLLM(prompt, [{ role: 'user', content: 'Generate strategy suggestions based on the above context.' }], {
    maxTokens: 2000,
    temperature: 0.7,
  });

  try {
    const suggestions = JSON.parse(response);
    return suggestions as StrategySuggestion[];
  } catch {
    return project.characters.map((char: any) => ({
      characterId: char.id,
      suggestions: {
        contentAngle: char.contentAngle || 'Build authority in your niche',
        goal: char.goal || 'Grow engaged following',
        postingFrequency: ROLE_STRATEGY_DEFAULTS[char.roleType]?.postingFrequency || 'daily',
        contentThemes: ROLE_STRATEGY_DEFAULTS[char.roleType]?.contentThemes || ['industry content'],
        interactionRules: ROLE_STRATEGY_DEFAULTS[char.roleType]?.interactionRules || ['engage with audience'],
        reasoning: 'Default strategy based on character role',
      },
    }));
  }
}

// ============================================
// APPLY SUGGESTIONS TO STRATEGY
// ============================================

export async function applySuggestions(
  projectId: string,
  userId: string,
  suggestions: StrategySuggestion[]
): Promise<StrategyTable> {
  const strategy = await getOrbitStrategy(projectId, userId);

  for (const suggestion of suggestions) {
    const entryIndex = strategy.entries.findIndex(
      (e) => e.characterId === suggestion.characterId
    );

    if (entryIndex !== -1) {
      strategy.entries[entryIndex] = {
        ...strategy.entries[entryIndex],
        contentAngle: suggestion.suggestions.contentAngle,
        goal: suggestion.suggestions.goal,
        postingFrequency: suggestion.suggestions.postingFrequency,
        contentThemes: suggestion.suggestions.contentThemes,
        interactionRules: suggestion.suggestions.interactionRules,
      };
    }
  }

  return updateOrbitStrategy(projectId, userId, strategy.entries);
}

// ============================================
// POSTING FREQUENCY HELPERS
// ============================================

export function getPostingFrequencyLabel(frequency: string): string {
  const labels: Record<string, string> = {
    daily: 'Once per day',
    twice_daily: 'Twice per day',
    every_other_day: 'Every other day',
    weekly: 'Once per week',
    twice_weekly: 'Twice per week',
    three_times_weekly: '3 times per week',
  };
  return labels[frequency] || frequency;
}

export function getPostingFrequencies(): { value: string; label: string }[] {
  return DEFAULT_POSTING_FREQUENCIES.map((f) => ({
    value: f,
    label: getPostingFrequencyLabel(f),
  }));
}
