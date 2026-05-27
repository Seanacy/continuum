import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'

// ============================================
// TYPES
// ============================================

export interface OrbitPost {
  id: string
  characterId: string
  characterName: string
  roleType: string
  platform: string
  content: string
  hashtags: string[]
  tone: string
  createdAt: string
}

export interface GenerateContentInput {
  projectId: string
  userId: string
  platform?: string
  count?: number
}

export interface GenerateContentResult {
  posts: OrbitPost[]
  tokensUsed: number
}

// ============================================
// PLATFORM CONFIGS
// ============================================

const PLATFORMS = ['Instagram', 'Twitter/X', 'LinkedIn', 'TikTok'] as const

const PLATFORM_GUIDELINES: Record<string, string> = {
  'Instagram': 'Visual-first captions, 2200 char max, conversational tone, use line breaks for readability, 5-15 hashtags at the end',
  'Twitter/X': 'Short and punchy, 280 char max, witty or thought-provoking, 1-3 hashtags inline',
  'LinkedIn': 'Professional but personable, storytelling format, 1300 char ideal, minimal hashtags (3-5), use line breaks',
  'TikTok': 'Casual and trendy, hook in first line, 150 char caption ideal, 3-5 trending hashtags',
}

// ============================================
// CONTENT GENERATION
// ============================================

export async function generateOrbitContent(input: GenerateContentInput): Promise<GenerateContentResult> {
  const { projectId, userId, platform, count = 1 } = input

  // Fetch the orbit project with characters
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
    include: {
      characters: {
        where: { isActive: true },
      },
    },
  })

  if (!project) {
    throw new Error('Orbit project not found')
  }

  if (project.characters.length === 0) {
    throw new Error('No active characters in this orbit')
  }

  const targetPlatforms = platform ? [platform] : ['Instagram', 'Twitter/X']
  let totalTokens = 0
  const allPosts: OrbitPost[] = []

  // Generate content for each active character
  for (const character of (project.characters as any[])) {
    const personality = character.personality
    const contentStrategy = character.contentStrategy
    const backstory = character.backstory

    const systemPrompt = `You are a social media content creator AI. You are generating content AS the character described below. Write in their voice, with their personality and style.

CHARACTER PROFILE:
- Name: ${character.name}
- Username: @${character.username}
- Role: ${character.roleType}
- Bio: ${character.bio || 'N/A'}

PERSONALITY:
- Tone: ${personality?.tone || 'friendly and engaging'}
- Style: ${personality?.style || 'conversational'}
- Values: ${personality?.values?.join(', ') || 'authenticity, connection'}
- Quirks: ${personality?.quirks?.join(', ') || 'none specified'}

CONTENT STRATEGY:
- Topics: ${contentStrategy?.topics?.join(', ') || 'general lifestyle'}
- Posting style: ${contentStrategy?.postingStyle || 'regular'}
- Content pillars: ${contentStrategy?.pillars?.join(', ') || 'entertainment, education'}

BACKSTORY:
${backstory?.summary || 'A passionate content creator building an engaged community.'}

BRAND CONTEXT:
- Project: ${project.name}
- Description: ${project.description || 'N/A'}
- Website: ${project.websiteUrl || 'N/A'}
- Target audience: ${project.targetAudience || 'general audience'}
- Objective: ${project.objective}

IMPORTANT RULES:
- Write AS this character, in first person
- Stay true to their personality and tone
- Make content feel authentic, not corporate
- Each post should be standalone and ready to publish
- Include relevant hashtags for the platform`

    for (const plat of targetPlatforms) {
      const userMessage = `Generate ${count} ${plat} post(s) for this character.

Platform guidelines: ${PLATFORM_GUIDELINES[plat] || 'Standard social media best practices'}

Return your response as a JSON array with this exact format:
[
  {
    \"content\": \"The full post text (without hashtags)\",
    \"hashtags\": [\"tag1\", \"tag2\", \"tag3\"],
    \"tone\": \"the emotional tone of this post (e.g. inspiring, witty, educational)\"
  }
]

Only return the JSON array, nothing else.`

      try {
        const response = await callLLM(systemPrompt, [{ role: 'user', content: userMessage }], {
          maxTokens: 1500,
          temperature: 0.85,
        })

        totalTokens += response.tokensUsed

        // Parse the LLM response
        const jsonMatch = response.content.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const posts = JSON.parse(jsonMatch[0])
          for (const post of posts) {
            allPosts.push({
              id: crypto.randomUUID(),
              characterId: character.id,
              characterName: character.name,
              roleType: character.roleType,
              platform: plat,
              content: post.content || '',
              hashtags: post.hashtags || [],
              tone: post.tone || 'neutral',
              createdAt: new Date().toISOString(),
            })
          }
        }
      } catch (err) {
        console.error(`Failed to generate content for ${character.name} on ${plat}:`, err)
        // Continue with other characters/platforms
      }
    }
  }

  // Store the generated content in the project's metadata
  const existingContent = (project.strategyTable as any)?.generatedContent || []
  const updatedContent = [...existingContent, ...allPosts].slice(-50) // Keep last 50 posts

  await db.orbitProject.update({
    where: { id: projectId },
    data: {
      strategyTable: {
        ...(project.strategyTable as any || {}),
        generatedContent: updatedContent,
        lastGeneratedAt: new Date().toISOString(),
      } as any,
    },
  })

  return { posts: allPosts, tokensUsed: totalTokens }
}

// ============================================
// FETCH EXISTING CONTENT
// ============================================

export async function getOrbitContent(projectId: string, userId: string): Promise<OrbitPost[]> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  })

  if (!project) {
    throw new Error('Orbit project not found')
  }

  const strategyTable = project.strategyTable as any
  return strategyTable?.generatedContent || []
}

// ============================================
// DELETE CONTENT
// ============================================

export async function deleteOrbitPost(projectId: string, userId: string, postId: string): Promise<void> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  })

  if (!project) {
    throw new Error('Orbit project not found')
  }

  const strategyTable = project.strategyTable as any
  const content = strategyTable?.generatedContent || []
  const filtered = content.filter((p: any) => p.id !== postId)

  await db.orbitProject.update({
    where: { id: projectId },
    data: {
      strategyTable: {
        ...(strategyTable || {}),
        generatedContent: filtered,
      } as any,
    },
  })
}
