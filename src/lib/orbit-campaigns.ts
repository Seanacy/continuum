import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'

// ============================================
// TYPES
// ============================================

interface CampaignCharacterAssignment {
  characterId: string
  role: string
  contentCount: number
  platforms: string[]
  angle: string
}

interface CampaignBrief {
  theme: string
  narrative: string
  keyMessages: string[]
  hashtags: string[]
  characterAssignments: CampaignCharacterAssignment[]
  contentMix: { type: string; count: number; platform: string }[]
  timeline: { day: number; description: string; characterIds: string[] }[]
}

interface CampaignPost {
  characterId: string
  content: string
  contentType: string
  platform: string
  scheduledDay: number
  hashtags: string[]
}

// ============================================
// CAMPAIGN BRIEF GENERATION
// ============================================

export async function generateCampaignBrief(
  projectId: string,
  campaignName: string,
  campaignGoal: string,
  durationDays: number,
  platforms: string[]
): Promise<CampaignBrief> {
  const project = await db.orbitProject.findUnique({
    where: { id: projectId },
    include: {
      characters: true,
    },
  })

  if (!project) throw new Error('Project not found')

  const characterDescriptions = project.characters.map((c: any) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    personality: (c.personality as any)?.traits || [],
    platforms: (c.contentStyle as any)?.platforms || ['twitter'],
    voice: (c.contentStyle as any)?.voice || 'casual',
  }))

  const systemPrompt = `You are a social media campaign strategist. Create a detailed campaign brief.

Return ONLY valid JSON with this structure:
{
  "theme": "campaign theme/tagline",
  "narrative": "2-3 sentence campaign narrative arc",
  "keyMessages": ["message1", "message2", "message3"],
  "hashtags": ["#tag1", "#tag2"],
  "characterAssignments": [
    {
      "characterId": "id",
      "role": "lead|support|amplifier",
      "contentCount": 5,
      "platforms": ["twitter"],
      "angle": "their unique angle on the campaign"
    }
  ],
  "contentMix": [
    { "type": "announcement|story|engagement|behind-the-scenes|reaction", "count": 3, "platform": "twitter" }
  ],
  "timeline": [
    { "day": 1, "description": "Launch day — teaser posts", "characterIds": ["id1"] }
  ]
}`

  const userMessage = `Create a campaign brief for:

Campaign: ${campaignName}
Goal: ${campaignGoal}
Duration: ${durationDays} days
Platforms: ${platforms.join(', ')}

Characters available:
${JSON.stringify(characterDescriptions, null, 2)}

Rules:
- Every character should participate
- Space content across the full duration
- Mix content types for variety
- Characters should reference each other naturally
- Build momentum toward a peak moment`

  const response = await callLLM(systemPrompt, [{ role: 'user', content: userMessage }], {
    maxTokens: 4000,
    temperature: 0.8,
  })

  try {
    const cleaned = response.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      theme: campaignName,
      narrative: campaignGoal,
      keyMessages: [campaignGoal],
      hashtags: [],
      characterAssignments: project.characters.map((c: any) => ({
        characterId: c.id,
        role: 'support',
        contentCount: Math.ceil(durationDays / 2),
        platforms: platforms.slice(0, 1),
        angle: 'General campaign support',
      })),
      contentMix: [{ type: 'announcement', count: durationDays, platform: platforms[0] || 'twitter' }],
      timeline: [{ day: 1, description: 'Campaign launch', characterIds: project.characters.map((c: any) => c.id) }],
    }
  }
}

// ============================================
// CAMPAIGN CONTENT GENERATION
// ============================================

export async function generateCampaignContent(
  projectId: string,
  brief: CampaignBrief
): Promise<CampaignPost[]> {
  const project = await db.orbitProject.findUnique({
    where: { id: projectId },
    include: { characters: true },
  })

  if (!project) throw new Error('Project not found')

  const posts: CampaignPost[] = []

  for (const assignment of brief.characterAssignments) {
    const character = project.characters.find((c: any) => c.id === assignment.characterId)
    if (!character) continue

    const systemPrompt = `You are ${(character as any).name}, a social media character.
Your personality: ${JSON.stringify((character as any).personality)}
Your voice style: ${JSON.stringify((character as any).contentStyle)}

Generate campaign content. Return ONLY a JSON array of post objects:
[
  {
    "content": "the post text",
    "contentType": "announcement|story|engagement|behind-the-scenes|reaction",
    "platform": "twitter|instagram|linkedin|tiktok",
    "scheduledDay": 1,
    "hashtags": ["#tag"]
  }
]`

    const userMessage = `Create ${assignment.contentCount} posts for the "${brief.theme}" campaign.

Your angle: ${assignment.angle}
Key messages to weave in: ${brief.keyMessages.join(', ')}
Campaign hashtags: ${brief.hashtags.join(' ')}
Platforms: ${assignment.platforms.join(', ')}
Duration: ${brief.timeline.length > 0 ? brief.timeline[brief.timeline.length - 1].day : 7} days

Timeline context:
${brief.timeline.map(t => `Day ${t.day}: ${t.description}`).join('\n')}

Make each post unique. Vary tone between casual, excited, thoughtful. Include emojis where natural.`

    const response = await callLLM(systemPrompt, [{ role: 'user', content: userMessage }], {
      maxTokens: 3000,
      temperature: 0.9,
    })

    try {
      const cleaned = response.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      const generated: any[] = JSON.parse(cleaned)
      for (const post of generated) {
        posts.push({
          characterId: assignment.characterId,
          content: post.content || '',
          contentType: post.contentType || 'announcement',
          platform: post.platform || assignment.platforms[0] || 'twitter',
          scheduledDay: post.scheduledDay || 1,
          hashtags: post.hashtags || brief.hashtags,
        })
      }
    } catch {
      posts.push({
        characterId: assignment.characterId,
        content: `${brief.keyMessages[0] || brief.theme} ${brief.hashtags.join(' ')}`,
        contentType: 'announcement',
        platform: assignment.platforms[0] || 'twitter',
        scheduledDay: 1,
        hashtags: brief.hashtags,
      })
    }
  }

  return posts
}

// ============================================
// CAMPAIGN CRUD
// ============================================

export async function createCampaign(
  projectId: string,
  userId: string,
  data: {
    name: string
    goal: string
    durationDays: number
    platforms: string[]
    startDate?: string
  }
) {
  const brief = await generateCampaignBrief(
    projectId,
    data.name,
    data.goal,
    data.durationDays,
    data.platforms
  )

  const campaign = await db.orbitPost.create({
    data: {
      id: `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      characterId: (await db.orbitCharacter.findFirst({ where: { projectId } }))?.id || '',
      content: JSON.stringify({
        type: 'campaign',
        name: data.name,
        goal: data.goal,
        durationDays: data.durationDays,
        platforms: data.platforms,
        startDate: data.startDate || new Date().toISOString(),
        brief,
        postsGenerated: false,
        status: 'draft',
      }),
      contentType: 'campaign',
      platform: 'multi',
      status: 'draft',
      metadata: { campaignName: data.name, type: 'campaign_master' } as any,
    },
  })

  return { campaign, brief }
}

export async function getCampaigns(projectId: string) {
  const campaigns = await db.orbitPost.findMany({
    where: {
      projectId,
      contentType: 'campaign',
    },
    orderBy: { createdAt: 'desc' },
  })

  return campaigns.map((c: any) => {
    let parsed: any = {}
    try { parsed = JSON.parse(c.content) } catch {}
    return {
      id: c.id,
      name: parsed.name || 'Untitled Campaign',
      goal: parsed.goal || '',
      durationDays: parsed.durationDays || 7,
      platforms: parsed.platforms || [],
      startDate: parsed.startDate || c.createdAt,
      brief: parsed.brief || null,
      postsGenerated: parsed.postsGenerated || false,
      status: parsed.status || c.status,
      postCount: 0,
      createdAt: c.createdAt,
    }
  })
}

export async function getCampaignWithPosts(campaignId: string) {
  const campaign = await db.orbitPost.findUnique({
    where: { id: campaignId },
  })

  if (!campaign) throw new Error('Campaign not found')

  let parsed: any = {}
  try { parsed = JSON.parse((campaign as any).content) } catch {}

  const posts = await db.orbitPost.findMany({
    where: {
      projectId: (campaign as any).projectId,
      metadata: { path: ['campaignId'], equals: campaignId },
    },
    include: { character: true },
    orderBy: { scheduledFor: 'asc' },
  })

  return {
    id: campaign.id,
    name: parsed.name || 'Untitled',
    goal: parsed.goal || '',
    durationDays: parsed.durationDays || 7,
    platforms: parsed.platforms || [],
    startDate: parsed.startDate,
    brief: parsed.brief || null,
    status: parsed.status || (campaign as any).status,
    posts,
    createdAt: (campaign as any).createdAt,
  }
}

export async function generateCampaignPosts(campaignId: string) {
  const campaign = await db.orbitPost.findUnique({
    where: { id: campaignId },
  })

  if (!campaign) throw new Error('Campaign not found')

  let parsed: any = {}
  try { parsed = JSON.parse((campaign as any).content) } catch {}

  if (!parsed.brief) throw new Error('No brief found — regenerate campaign')

  const posts = await generateCampaignContent((campaign as any).projectId, parsed.brief)
  const startDate = new Date(parsed.startDate || Date.now())

  const created = []
  for (const post of posts) {
    const scheduledFor = new Date(startDate)
    scheduledFor.setDate(scheduledFor.getDate() + (post.scheduledDay - 1))

    const record = await db.orbitPost.create({
      data: {
        id: `cpost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: (campaign as any).projectId,
        characterId: post.characterId,
        content: post.content,
        contentType: post.contentType,
        platform: post.platform,
        status: 'draft',
        scheduledFor,
        metadata: {
          campaignId,
          campaignName: parsed.name,
          hashtags: post.hashtags,
          scheduledDay: post.scheduledDay,
        } as any,
      },
    })
    created.push(record)
  }

  parsed.postsGenerated = true
  parsed.status = 'active'
  await db.orbitPost.update({
    where: { id: campaignId },
    data: {
      content: JSON.stringify(parsed),
      status: 'approved',
    },
  })

  return created
}

export async function updateCampaignStatus(campaignId: string, status: string) {
  const campaign = await db.orbitPost.findUnique({
    where: { id: campaignId },
  })

  if (!campaign) throw new Error('Campaign not found')

  let parsed: any = {}
  try { parsed = JSON.parse((campaign as any).content) } catch {}
  parsed.status = status

  await db.orbitPost.update({
    where: { id: campaignId },
    data: {
      content: JSON.stringify(parsed),
      status: status === 'active' ? 'approved' : status,
    },
  })

  return { success: true }
}

export async function deleteCampaign(campaignId: string) {
  const campaign = await db.orbitPost.findUnique({
    where: { id: campaignId },
  })

  if (!campaign) throw new Error('Campaign not found')

  await db.orbitPost.deleteMany({
    where: {
      projectId: (campaign as any).projectId,
      metadata: { path: ['campaignId'], equals: campaignId },
    },
  })

  await db.orbitPost.delete({ where: { id: campaignId } })

  return { success: true, deleted: true }
}
