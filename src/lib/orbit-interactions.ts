import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'
import { OrbitPost } from '@/lib/orbit-content'

// ============================================
// TYPES
// ============================================

export interface OrbitInteraction {
  id: string
  type: 'comment' | 'reply' | 'shoutout' | 'collab'
  fromCharacterId: string
  fromCharacterName: string
  toCharacterId: string
  toCharacterName: string
  postId?: string
  postPreview?: string
  platform: string
  content: string
  createdAt: string
}

export interface GenerateInteractionsInput {
  projectId: string
  userId: string
  count?: number
}

export interface GenerateInteractionsResult {
  interactions: OrbitInteraction[]
  tokensUsed: number
}

// ============================================
// INTERACTION TEMPLATES
// ============================================

const INTERACTION_TYPES = [
  {
    type: 'comment',
    description: 'A supportive or engaging comment on another character\'s post',
    prompt: 'Write a genuine comment that this character would leave on the other character\'s post. It should feel natural, not forced.',
  },
  {
    type: 'reply',
    description: 'A reply in a conversation thread between two characters',
    prompt: 'Write a conversational reply between these two characters. It should feel like real friends or colleagues chatting.',
  },
  {
    type: 'shoutout',
    description: 'A public mention or recommendation of another character',
    prompt: 'Write a shoutout post where this character publicly praises or recommends the other character. Make it feel authentic.',
  },
  {
    type: 'collab',
    description: 'A collaborative content idea pitched between characters',
    prompt: 'Write a post where this character proposes or announces a collaboration with the other character. Make it exciting and on-brand.',
  },
] as const

// ============================================
// GENERATE INTERACTIONS
// ============================================

export async function generateOrbitInteractions(
  input: GenerateInteractionsInput
): Promise<GenerateInteractionsResult> {
  const { projectId, userId, count = 3 } = input

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

  const characters = project.characters as any[]
  if (characters.length < 2) {
    throw new Error('Need at least 2 active characters for interactions')
  }

  // Get existing content to reference in interactions
  const strategyTable = project.strategyTable as any
  const existingPosts: OrbitPost[] = strategyTable?.generatedContent || []

  let totalTokens = 0
  const interactions: OrbitInteraction[] = []

  // Generate the requested number of interactions
  for (let i = 0; i < count; i++) {
    // Pick two different random characters
    const fromIdx = Math.floor(Math.random() * characters.length)
    let toIdx = Math.floor(Math.random() * characters.length)
    while (toIdx === fromIdx) {
      toIdx = Math.floor(Math.random() * characters.length)
    }
    const fromChar = characters[fromIdx]
    const toChar = characters[toIdx]

    // Pick a random interaction type
    const interactionType = INTERACTION_TYPES[Math.floor(Math.random() * INTERACTION_TYPES.length)]

    // Find a post from the target character to comment on (if available)
    const targetPosts = existingPosts.filter(p => p.characterId === toChar.id)
    const targetPost = targetPosts.length > 0
      ? targetPosts[Math.floor(Math.random() * targetPosts.length)]
      : null

    const platform = targetPost?.platform || 'Instagram'

    const systemPrompt = `You are generating a social media interaction between two AI influencer characters. The interaction should feel completely natural and authentic — like real people engaging with each other online.

FROM CHARACTER (the one writing):
- Name: ${fromChar.name}
- Username: @${fromChar.username}
- Role: ${fromChar.roleType}
- Tone: ${fromChar.personality?.tone || 'friendly'}
- Style: ${fromChar.personality?.style || 'conversational'}
- Values: ${fromChar.personality?.values?.join(', ') || 'authenticity'}

TO CHARACTER (the one being engaged with):
- Name: ${toChar.name}
- Username: @${toChar.username}
- Role: ${toChar.roleType}
- Tone: ${toChar.personality?.tone || 'friendly'}

RELATIONSHIP CONTEXT:
Both characters are part of the "${project.name}" orbit — ${project.description || 'a connected network of AI influencers'}.
They should interact as ${project.objective === 'brand_awareness' ? 'brand ambassadors who support each other' : project.objective === 'community' ? 'community members who genuinely connect' : 'collaborators with shared interests'}.

${targetPost ? `POST BEING REFERENCED:
Platform: ${targetPost.platform}
Content: "${targetPost.content.substring(0, 200)}"
Hashtags: ${targetPost.hashtags.join(', ')}` : 'No specific post — this is an organic interaction.'}

RULES:
- Write AS the FROM character, in their voice
- Reference the TO character naturally (by name or @username)
- Keep it platform-appropriate for ${platform}
- Make it feel real, not scripted or corporate
- Keep comments short (1-3 sentences), shoutouts medium (2-4 sentences), collabs can be longer`

    const userMessage = `Generate a "${interactionType.type}" interaction.
${interactionType.prompt}

Return ONLY a JSON object:
{
  "content": "the interaction text",
  "platform": "${platform}"
}`

    try {
      const response = await callLLM(systemPrompt, [{ role: 'user', content: userMessage }], {
        maxTokens: 500,
        temperature: 0.9,
      })

      totalTokens += response.tokensUsed

      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        interactions.push({
          id: crypto.randomUUID(),
          type: interactionType.type as OrbitInteraction['type'],
          fromCharacterId: fromChar.id,
          fromCharacterName: fromChar.name,
          toCharacterId: toChar.id,
          toCharacterName: toChar.name,
          postId: targetPost?.id,
          postPreview: targetPost?.content?.substring(0, 100),
          platform: parsed.platform || platform,
          content: parsed.content || '',
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error(`Failed to generate interaction from ${fromChar.name} to ${toChar.name}:`, err)
    }
  }

  // Store interactions in the project
  const existingInteractions = strategyTable?.interactions || []
  const updatedInteractions = [...existingInteractions, ...interactions].slice(-100)

  await db.orbitProject.update({
    where: { id: projectId },
    data: {
      strategyTable: {
        ...(strategyTable || {}),
        interactions: updatedInteractions,
        lastInteractionAt: new Date().toISOString(),
      } as any,
    },
  })

  return { interactions, tokensUsed: totalTokens }
}

// ============================================
// FETCH INTERACTIONS
// ============================================

export async function getOrbitInteractions(
  projectId: string,
  userId: string
): Promise<OrbitInteraction[]> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  })

  if (!project) {
    throw new Error('Orbit project not found')
  }

  const strategyTable = project.strategyTable as any
  return strategyTable?.interactions || []
}

// ============================================
// DELETE INTERACTION
// ============================================

export async function deleteOrbitInteraction(
  projectId: string,
  userId: string,
  interactionId: string
): Promise<void> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  })

  if (!project) {
    throw new Error('Orbit project not found')
  }

  const strategyTable = project.strategyTable as any
  const existing = strategyTable?.interactions || []
  const filtered = existing.filter((i: any) => i.id !== interactionId)

  await db.orbitProject.update({
    where: { id: projectId },
    data: {
      strategyTable: {
        ...(strategyTable || {}),
        interactions: filtered,
      } as any,
    },
  })
}
