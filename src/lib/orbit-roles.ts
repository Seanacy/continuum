// ============================================
// CONTINUUM ORBIT: ROLE DEFINITIONS & CONFIG
// ============================================

export type OrbitRoleType =
  | 'main_character'
  | 'builder'
  | 'chaos'
  | 'expert'
  | 'mystery'
  | 'social_connector';

export interface OrbitRoleDefinition {
  type: OrbitRoleType;
  label: string;
  emoji: string;
  description: string;
  contentStyle: string;
  voiceTone: string;
  defaultGoal: string;
  exampleAngles: string[];
}

// ============================================
// THE 6 ORBIT ROLES
// ============================================

export const ORBIT_ROLES: Record<OrbitRoleType, OrbitRoleDefinition> = {
  main_character: {
    type: 'main_character',
    label: 'Main Character',
    emoji: '\u2B50',
    description: 'The face of the brand. Relatable, aspirational, always center stage.',
    contentStyle: 'Personal stories, behind-the-scenes, day-in-the-life, product showcases',
    voiceTone: 'Warm, confident, authentic',
    defaultGoal: 'Build brand identity and trust',
    exampleAngles: [
      'Morning routine featuring the product',
      'Honest review of own brand',
      'Responding to fan questions',
      'Sharing the origin story'
    ]
  },
  builder: {
    type: 'builder',
    label: 'The Builder',
    emoji: '\uD83D\uDD27',
    description: 'Shows the work. Process-focused, educational, builds in public.',
    contentStyle: 'Tutorials, how-it-works, progress updates, tool breakdowns',
    voiceTone: 'Focused, practical, encouraging',
    defaultGoal: 'Demonstrate expertise and build credibility',
    exampleAngles: [
      'Building a feature from scratch',
      'Tool comparison for the industry',
      'Weekly progress update',
      'Mistakes I made and what I learned'
    ]
  },
  chaos: {
    type: 'chaos',
    label: 'Chaos Personality',
    emoji: '\uD83C\uDF2A\uFE0F',
    description: 'The wildcard. Hot takes, memes, controversial opinions. Drives engagement through unpredictability.',
    contentStyle: 'Hot takes, memes, reaction content, trend-jacking, rants',
    voiceTone: 'Bold, irreverent, entertaining',
    defaultGoal: 'Maximize engagement and virality',
    exampleAngles: [
      'Unpopular opinion about the industry',
      'Roasting competitors (playfully)',
      'Reacting to trending topics',
      'Creating chaos with polls and debates'
    ]
  },
  expert: {
    type: 'expert',
    label: 'The Expert',
    emoji: '\uD83C\uDF93',
    description: 'Deep knowledge. Data-driven, analytical, the one people trust for real answers.',
    contentStyle: 'Deep dives, data analysis, research breakdowns, myth-busting',
    voiceTone: 'Authoritative, measured, insightful',
    defaultGoal: 'Establish thought leadership',
    exampleAngles: [
      'Industry trend analysis with data',
      'Myth vs reality breakdown',
      'Case study deep dive',
      'Predicting what comes next'
    ]
  },
  mystery: {
    type: 'mystery',
    label: 'Mystery Character',
    emoji: '\uD83C\uDF11',
    description: 'Enigmatic presence. Drops hints, creates intrigue, builds anticipation.',
    contentStyle: 'Teasers, cryptic posts, countdowns, hidden messages, ARG-style content',
    voiceTone: 'Cryptic, intriguing, minimal',
    defaultGoal: 'Create curiosity and anticipation',
    exampleAngles: [
      'Teasing an upcoming launch',
      'Dropping coded hints about features',
      'Anonymous insider perspective',
      'Building a mystery narrative'
    ]
  },
  social_connector: {
    type: 'social_connector',
    label: 'Social Connector',
    emoji: '\uD83E\uDD1D',
    description: 'The community builder. Engages with everyone, amplifies others, creates connections.',
    contentStyle: 'Shoutouts, collaborations, community highlights, Q&As, polls',
    voiceTone: 'Friendly, supportive, inclusive',
    defaultGoal: 'Grow community and drive word-of-mouth',
    exampleAngles: [
      'Highlighting community members',
      'Cross-promoting with other creators',
      'Hosting community challenges',
      'Curating user-generated content'
    ]
  }
};

// ============================================
// ROLE LISTS & HELPERS
// ============================================

export const ALL_ROLE_TYPES: OrbitRoleType[] = [
  'main_character', 'builder', 'chaos', 'expert', 'mystery', 'social_connector'
];

// Main character is always included in budget mode
export const BUDGET_REQUIRED_ROLE: OrbitRoleType = 'main_character';
export const BUDGET_CHARACTER_COUNT = 3;
export const FULL_CHARACTER_COUNT = 6;

export function getRoleDefinition(type: OrbitRoleType): OrbitRoleDefinition {
  return ORBIT_ROLES[type];
}

export function getRoleLabel(type: OrbitRoleType): string {
  return ORBIT_ROLES[type].label;
}

export function getRoleEmoji(type: OrbitRoleType): string {
  return ORBIT_ROLES[type].emoji;
}

// ============================================
// ORBIT OBJECTIVES
// ============================================

export type OrbitObjective = 'awareness' | 'traffic' | 'signups' | 'sales' | 'audience_growth';

export interface ObjectiveDefinition {
  type: OrbitObjective;
  label: string;
  description: string;
  suggestedRoleFocus: OrbitRoleType[];
}

export const ORBIT_OBJECTIVES: Record<OrbitObjective, ObjectiveDefinition> = {
  awareness: {
    type: 'awareness',
    label: 'Brand Awareness',
    description: 'Get your name out there. Focus on reach and impressions.',
    suggestedRoleFocus: ['main_character', 'chaos', 'social_connector']
  },
  traffic: {
    type: 'traffic',
    label: 'Drive Traffic',
    description: 'Send people to your website or app.',
    suggestedRoleFocus: ['main_character', 'expert', 'builder']
  },
  signups: {
    type: 'signups',
    label: 'Get Signups',
    description: 'Convert visitors into registered users.',
    suggestedRoleFocus: ['main_character', 'builder', 'mystery']
  },
  sales: {
    type: 'sales',
    label: 'Drive Sales',
    description: 'Turn followers into paying customers.',
    suggestedRoleFocus: ['main_character', 'expert', 'social_connector']
  },
  audience_growth: {
    type: 'audience_growth',
    label: 'Grow Audience',
    description: 'Build a larger, engaged following.',
    suggestedRoleFocus: ['social_connector', 'chaos', 'main_character']
  }
};

// ============================================
// RELATIONSHIP TYPES
// ============================================

export const ORBIT_RELATIONSHIP_TYPES = [
  'friend',
  'rival',
  'collaborator',
  'mentor',
  'subordinate',
  'mysterious_connection',
  'hidden_tension'
] as const;

export type OrbitRelationshipType = typeof ORBIT_RELATIONSHIP_TYPES[number];

// ============================================
// COST CONFIGURATION
// ============================================

export const ORBIT_COSTS = {
  // Character generation (per character)
  characterGeneration: {
    personality: 0.01,    // LLM call to generate personality
    appearance: 0.01,     // LLM call to generate appearance desc
    profileImage: 0.05,   // Image generation per image
    profileImagesPerChar: 6,
  },
  // Strategy generation
  strategyGeneration: 0.02,   // LLM call for strategy table
  // Relationship mapping
  relationshipMapping: 0.01,  // LLM call per relationship pair
  // Content generation (per piece)
  contentGeneration: {
    post: 0.01,           // LLM call for post copy
    image: 0.05,          // Image generation for post
    caption: 0.005,       // LLM call for caption
  }
};

export function estimateSetupCost(characterCount: number): number {
  const charCost = characterCount * (
    ORBIT_COSTS.characterGeneration.personality +
    ORBIT_COSTS.characterGeneration.appearance +
    (ORBIT_COSTS.characterGeneration.profileImage * ORBIT_COSTS.characterGeneration.profileImagesPerChar)
  );
  const strategyCost = ORBIT_COSTS.strategyGeneration;
  // relationships = n*(n-1)/2 pairs
  const relationshipPairs = (characterCount * (characterCount - 1)) / 2;
  const relationshipCost = relationshipPairs * ORBIT_COSTS.relationshipMapping;
  return charCost + strategyCost + relationshipCost;
}

export function formatCost(dollars: number): string {
  return '$' + dollars.toFixed(2);
}
