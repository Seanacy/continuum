// ============================================
// CONTINUUM ORBIT: AI GENERATION ENGINE
// ============================================
// Generates the 6 AI influencer characters, their
// personalities, relationships, and strategy table
// based on the user's project information.

import { callLLM } from '@/lib/llm'
import { db } from '@/lib/db'
import {
  ORBIT_ROLES,
  ALL_ROLE_TYPES,
  BUDGET_CHARACTER_COUNT,
  FULL_CHARACTER_COUNT,
  BUDGET_REQUIRED_ROLE,
  ORBIT_COSTS,
  estimateSetupCost,
  type OrbitRoleType,
  ORBIT_OBJECTIVES,
  type OrbitObjective,
} from '@/lib/orbit-roles'

// ============================================
// TYPES
// ============================================

export interface OrbitProjectInput {
  userId: string
  name: string
  websiteUrl?: string
  description: string
  industry?: string
  targetAudience?: string
  objective: OrbitObjective
  characterCount: 3 | 6
}

interface GeneratedCharacter {
  roleType: OrbitRoleType
  name: string
  username: string
  appearance: Record<string, unknown>
  personality: Record<string, unknown>
  behavior: Record<string, unknown>
  contentProfile: Record<string, unknown>
  imagePrompt: string
  contentAngle: string
  goal: string
}

interface GeneratedRelationship {
  characterARole: OrbitRoleType
  characterBRole: OrbitRoleType
  relationshipType: string
  description: string
  interactionIdeas: string[]
}

interface GeneratedStrategy {
  character: string
  role: string
  contentAngle: string
  goal: string
  postFrequency: string
  platforms: string[]
}

// ============================================
// CUID GENERATOR (simple)
// ============================================

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const timestamp = Date.now().toString(36)
  let random = ''
  for (let i = 0; i < 8; i++) {
    random += chars[Math.floor(Math.random() * chars.length)]
  }
  return 'c' + timestamp + random
}

// ============================================
// STEP 1: SELECT ROLES
// ============================================

function selectRoles(characterCount: 3 | 6, objective: OrbitObjective): OrbitRoleType[] {
  if (characterCount === 6) return [...ALL_ROLE_TYPES]

  // Budget mode: main_character always included + AI picks best 2
  const roles: OrbitRoleType[] = [BUDGET_REQUIRED_ROLE]
  const available = ALL_ROLE_TYPES.filter(r => r !== BUDGET_REQUIRED_ROLE)

  // Prioritize roles that match the objective
  const objDef = ORBIT_OBJECTIVES[objective]
  const suggestedRoleFocus = objDef ? objDef.suggestedRoleFocus : []
  const prioritized = available.sort((a, b) => {
    const aMatch = suggestedRoleFocus.includes(a) ? 0 : 1
    const bMatch = suggestedRoleFocus.includes(b) ? 0 : 1
    return aMatch - bMatch
  })

  roles.push(prioritized[0], prioritized[1])
  return roles
}

// ============================================
// STEP 2: GENERATE CHARACTERS
// ============================================

async function generateCharacters(
  input: OrbitProjectInput,
  roles: OrbitRoleType[]
): Promise<GeneratedCharacter[]> {
  const roleDescriptions = roles.map(r => {
    const def = ORBIT_ROLES[r]
    return `- ${def.label} (${r}): ${def.description}. Content style: ${def.contentStyle}. Voice: ${def.voiceTone}.`
  }).join('\n')

  const systemPrompt = `You are an expert AI influencer network architect. You create compelling, distinct AI personalities that work together to promote a project across social media.

You must respond with ONLY valid JSON, no markdown, no explanation.`

  const userPrompt = `Create ${roles.length} AI influencer characters for this project:

PROJECT: ${input.name}
DESCRIPTION: ${input.description}
INDUSTRY: ${input.industry || 'General'}
TARGET AUDIENCE: ${input.targetAudience || 'General audience'}
OBJECTIVE: ${input.objective}
WEBSITE: ${input.websiteUrl || 'N/A'}

ROLES TO FILL:
${roleDescriptions}

For each character, generate:
1. A unique, memorable name (first name + optional last name or handle)
2. A social media username (@ handle style, no spaces)
3. Appearance description (for AI image generation later) — age range, style, vibe, aesthetic
4. Personality traits (5-7 key traits as an object with trait names as keys and descriptions as values)
5. Behavior patterns (posting frequency, engagement style, interaction preferences as an object)
6. Content profile (preferred formats, topics, tone, hashtag style as an object)
7. An image generation prompt (detailed prompt for creating their profile picture)
8. Their specific content angle for THIS project
9. Their specific goal within the network

Return a JSON array of objects with these exact keys:
[{
  "roleType": "the_role_type",
  "name": "Character Name",
  "username": "theusername",
  "appearance": { "ageRange": "25-30", "style": "...", "aesthetic": "...", "keyFeatures": "..." },
  "personality": { "trait1": "description", "trait2": "description", ... },
  "behavior": { "postFrequency": "...", "engagementStyle": "...", "responseTime": "...", "interactionPreference": "..." },
  "contentProfile": { "formats": ["..."], "topics": ["..."], "tone": "...", "hashtagStyle": "..." },
  "imagePrompt": "detailed prompt for profile picture generation",
  "contentAngle": "their unique angle on this project",
  "goal": "their specific goal in the network"
}]`

  const response = await callLLM(systemPrompt, [
    { role: 'user', content: userPrompt }
  ], { maxTokens: 4096, temperature: 0.8 })

  try {
    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = response.content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const characters: GeneratedCharacter[] = JSON.parse(jsonStr)
    return characters
  } catch (e) {
    console.error('Failed to parse character generation response:', e)
    throw new Error('Character generation failed — invalid AI response')
  }
}

// ============================================
// STEP 3: GENERATE RELATIONSHIPS
// ============================================

async function generateRelationships(
  characters: GeneratedCharacter[],
  input: OrbitProjectInput
): Promise<GeneratedRelationship[]> {
  const charSummaries = characters.map(c =>
    `- ${c.name} (@${c.username}) — ${ORBIT_ROLES[c.roleType].label}: ${c.contentAngle}`
  ).join('\n')

  const systemPrompt = `You are an expert at creating compelling dynamics between AI influencer characters. You design relationships that create engaging content through interactions, collaborations, and drama.

You must respond with ONLY valid JSON, no markdown, no explanation.`

  const userPrompt = `Create relationships between these AI influencers promoting "${input.name}":

CHARACTERS:
${charSummaries}

For every unique pair of characters, define their relationship. Include:
1. The relationship type (friend, rival, collaborator, mentor, subordinate, mysterious_connection, or hidden_tension)
2. A description of how they interact
3. 3-4 content interaction ideas (things they could do together publicly)

Return a JSON array:
[{
  "characterARole": "role_type_a",
  "characterBRole": "role_type_b",
  "relationshipType": "friend|rival|collaborator|mentor|subordinate|mysterious_connection|hidden_tension",
  "description": "How these two interact and their dynamic",
  "interactionIdeas": ["idea1", "idea2", "idea3"]
}]`

  const response = await callLLM(systemPrompt, [
    { role: 'user', content: userPrompt }
  ], { maxTokens: 3000, temperature: 0.7 })

  try {
    let jsonStr = response.content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('Failed to parse relationship generation response:', e)
    throw new Error('Relationship generation failed — invalid AI response')
  }
}

// ============================================
// STEP 4: GENERATE STRATEGY TABLE
// ============================================

async function generateStrategy(
  characters: GeneratedCharacter[],
  input: OrbitProjectInput
): Promise<GeneratedStrategy[]> {
  const charSummaries = characters.map(c =>
    `- ${c.name} (${ORBIT_ROLES[c.roleType].label}): ${c.contentAngle}`
  ).join('\n')

  const systemPrompt = `You are a social media strategist. You create coordinated content strategies for AI influencer networks.

You must respond with ONLY valid JSON, no markdown, no explanation.`

  const userPrompt = `Create a coordinated content strategy for these AI influencers promoting "${input.name}":

PROJECT: ${input.description}
OBJECTIVE: ${input.objective}
TARGET AUDIENCE: ${input.targetAudience || 'General'}

CHARACTERS:
${charSummaries}

For each character, define:
1. Their content angle (what they specifically post about)
2. Their goal (what metric they drive)
3. Post frequency (e.g., "3x/week", "daily")
4. Best platforms for their content type

Return a JSON array:
[{
  "character": "Character Name",
  "role": "Role Label",
  "contentAngle": "What they post about",
  "goal": "What they drive (awareness, clicks, signups, etc.)",
  "postFrequency": "3x/week",
  "platforms": ["Instagram", "Twitter", "TikTok"]
}]`

  const response = await callLLM(systemPrompt, [
    { role: 'user', content: userPrompt }
  ], { maxTokens: 2000, temperature: 0.6 })

  try {
    let jsonStr = response.content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('Failed to parse strategy generation response:', e)
    throw new Error('Strategy generation failed — invalid AI response')
  }
}

// ============================================
// MAIN: GENERATE FULL ORBIT
// ============================================

export async function generateOrbit(input: OrbitProjectInput): Promise<{
  projectId: string
  characters: { id: string; name: string; roleType: string }[]
  relationshipCount: number
  estimatedCost: number
}> {
  // 1. Select roles based on count and objective
  const roles = selectRoles(input.characterCount, input.objective)

  // 2. Create the project record
  const projectId = generateId()
  await db.orbitProject.create({
    data: {
      id: projectId,
      userId: input.userId,
      name: input.name,
      websiteUrl: input.websiteUrl || null,
      description: input.description,
      industry: input.industry || null,
      targetAudience: input.targetAudience || null,
      objective: input.objective,
      characterCount: input.characterCount,
      status: 'generating',
    }
  })

  try {
    // 3. Generate characters via LLM
    const generatedChars = await generateCharacters(input, roles)

    // 4. Save characters to DB
    const savedChars: { id: string; name: string; roleType: string }[] = []
    for (const char of generatedChars) {
      const charId = generateId()
      await db.orbitCharacter.create({
        data: {
          id: charId,
          projectId,
          roleType: char.roleType,
          name: char.name,
          username: char.username,
          appearance: char.appearance as Record<string, unknown>,
          personality: char.personality as Record<string, unknown>,
          behavior: char.behavior as Record<string, unknown>,
          contentProfile: char.contentProfile as Record<string, unknown>,
          imagePrompt: char.imagePrompt,
          contentAngle: char.contentAngle,
          goal: char.goal,
        }
      })
      savedChars.push({ id: charId, name: char.name, roleType: char.roleType })
    }

    // 5. Generate relationships via LLM
    const generatedRels = await generateRelationships(generatedChars, input)

    // 6. Save relationships to DB
    let relCount = 0
    for (const rel of generatedRels) {
      const charA = savedChars.find(c => c.roleType === rel.characterARole)
      const charB = savedChars.find(c => c.roleType === rel.characterBRole)
      if (charA && charB) {
        await db.orbitRelationship.create({
          data: {
            id: generateId(),
            characterAId: charA.id,
            characterBId: charB.id,
            relationshipType: rel.relationshipType,
            description: rel.description,
            interactionIdeas: rel.interactionIdeas,
          }
        })
        relCount++
      }
    }

    // 7. Generate strategy table via LLM
    const strategy = await generateStrategy(generatedChars, input)

    // 8. Update project with strategy and mark active
    const totalCostCents = Math.round(estimateSetupCost(input.characterCount) * 100)
    await db.orbitProject.update({
      where: { id: projectId },
      data: {
        strategyTable: strategy as unknown as Record<string, unknown>[],
        status: 'active',
        totalCostCents,
      }
    })

    return {
      projectId,
      characters: savedChars,
      relationshipCount: relCount,
      estimatedCost: totalCostCents / 100,
    }
  } catch (error) {
    // Mark project as failed if generation errors
    await db.orbitProject.update({
      where: { id: projectId },
      data: { status: 'draft' }
    })
    throw error
  }
}

// ============================================
// HELPERS: FETCH ORBIT DATA
// ============================================

export async function getOrbitProject(projectId: string, userId: string) {
  return db.orbitProject.findFirst({
    where: { id: projectId, userId },
    include: {
      characters: {
        include: {
          relationshipsAsA: true,
          relationshipsAsB: true,
        }
      }
    }
  })
}

export async function getUserOrbitProjects(userId: string) {
  return db.orbitProject.findMany({
    where: { userId },
    include: {
      characters: {
        select: { id: true, name: true, roleType: true, username: true, isActive: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function deleteOrbitProject(projectId: string, userId: string) {
  // Cascade delete handles characters and relationships
  return db.orbitProject.deleteMany({
    where: { id: projectId, userId }
  })
}
