import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'
import { BUNDLES, CATEGORIES, TEMPLATES, TALKING_PROFILES } from '@/lib/bundles'
import { generateImage } from '@/lib/image-engine'
import { startVideoGeneration } from '@/lib/video-pipeline'
import { chargeAmount } from '@/lib/credit-system'
import { TRAIT_CATEGORIES } from '@/lib/visual-traits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ============================================
// Helpers
// ============================================

/** Build a compact bundle catalog for the LLM (saves tokens) */
function getBundleCatalog(): string {
  const lines: string[] = []
  for (const cat of CATEGORIES) {
    const catBundles = BUNDLES.filter((b) => {
      const prefix = b.id.split('-')[0]
      const catPrefixMap: Record<string, string> = {
        identity: 'id', backstory: 'bs', energy: 'en', humor: 'hu',
        communication: 'cm', values: 'va', conflict: 'cf', social: 'so',
        ambition: 'am', creativity: 'cr', quirks: 'qk',
      }
      return prefix === catPrefixMap[cat.key]
    })
    const entries = catBundles.map((b) => `${b.id}="${b.name}"`).join(', ')
    lines.push(`${cat.key}: ${entries}`)
  }
  return lines.join('\n')
}

/** Gather everything the AI knows about this user */
async function getUserContext(userId: string) {
  const [business, memories, user] = await Promise.all([
    db.business.findFirst({ where: { userId } }),
    db.memory.findMany({ where: { userId }, orderBy: { weight: 'desc' }, take: 30 }),
    db.user.findUnique({ where: { id: userId }, select: { name: true, aiName: true } }),
  ])

  const memoryText = memories.map((m) => `- [${m.type}] ${m.content}`).join('\n')

  const businessText = business
    ? [
        business.name && `Business: ${business.name}`,
        business.businessType && `Type: ${business.businessType}`,
        business.productsServices && `Products/Services: ${business.productsServices}`,
        business.targetAudience && `Target audience: ${business.targetAudience}`,
        business.location && `Location: ${business.location}`,
        business.brandVoice && `Brand voice: ${business.brandVoice}`,
        business.websiteUrl && `Website: ${business.websiteUrl}`,
      ].filter(Boolean).join('\n')
    : 'No business info available yet.'

  return {
    business,
    businessText,
    memoryText,
    userName: user?.name || 'the user',
    aiName: user?.aiName || 'AI',
  }
}

/** Validate that every bundle ID the AI picked actually exists */
function validateSelections(selections: Record<string, string>): Record<string, string> {
  const validIds = new Set(BUNDLES.map((b) => b.id))
  const cleaned: Record<string, string> = {}
  for (const [cat, bundleId] of Object.entries(selections)) {
    if (validIds.has(bundleId)) {
      cleaned[cat] = bundleId
    } else {
      // Fall back to first bundle in that category
      const prefix: Record<string, string> = {
        identity: 'id', backstory: 'bs', energy: 'en', humor: 'hu',
        communication: 'cm', values: 'va', conflict: 'cf', social: 'so',
        ambition: 'am', creativity: 'cr', quirks: 'qk',
      }
      const fallback = BUNDLES.find((b) => b.id.startsWith(prefix[cat] + '-'))
      if (fallback) cleaned[cat] = fallback.id
    }
  }
  return cleaned
}

// ============================================
// POST — client-driven steps
// ============================================
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { step, mode } = body

    // -----------------------------------------
    // STEP: generate-options (guided mode only)
    // Returns curated choices for the user
    // -----------------------------------------
    if (step === 'generate-options') {
      const ctx = await getUserContext(user.id)
      const catalog = getBundleCatalog()

      const systemPrompt = `You are a character design expert. The user wants to create an AI personality for their brand.

Here is everything you know about them:
${ctx.businessText}

Their memories/facts:
${ctx.memoryText}

Available personality templates:
${TEMPLATES.map((t) => `${t.name} (${t.emoji})`).join(', ')}

You must return ONLY valid JSON with this exact structure:
{
  "nameOptions": [
    { "name": "...", "reason": "one sentence why this fits their brand" }
  ],
  "personalityOptions": [
    {
      "label": "short archetype name",
      "description": "2 sentences describing the vibe",
      "templateId": "tpl-X or null if custom",
      "selections": { "identity": "id-X", "backstory": "bs-X", ... all 11 categories }
    }
  ],
  "appearanceOptions": [
    { "label": "short description", "imagePrompt": "detailed image generation prompt" }
  ]
}

Rules:
- nameOptions: exactly 3 names that match the user's brand and industry
- personalityOptions: exactly 3 options. Each must have valid bundle IDs from the catalog below. One can match a template, others should be custom combos.
- appearanceOptions: exactly 3 visual styles. Image prompts should be professional headshot/portrait style, specific about features.

Bundle catalog:
${catalog}`

      const response = await callLLM(systemPrompt, [
        { role: 'user', content: 'Generate character creation options for me based on my brand.' },
      ], { maxTokens: 2000, temperature: 0.8 })

      // Parse JSON from response
      let options
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        options = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      } catch {
        return NextResponse.json({ error: 'Failed to parse AI options' }, { status: 500 })
      }

      // Validate all bundle IDs in personality options
      if (options?.personalityOptions) {
        for (const opt of options.personalityOptions) {
          if (opt.selections) {
            opt.selections = validateSelections(opt.selections)
          }
        }
      }

      return NextResponse.json({ options })
    }

    // -----------------------------------------
    // STEP: generate-profile (auto or guided)
    // AI creates the full character profile
    // -----------------------------------------
    if (step === 'generate-profile') {
      const ctx = await getUserContext(user.id)
      const catalog = getBundleCatalog()

      // In guided mode, the user's answers are passed in
      const guidedAnswers = body.answers // { name, personalityIndex, appearanceIndex } or full selections

      let systemPrompt: string
      if (mode === 'guided' && guidedAnswers) {
        // User already picked options — just finalize
        systemPrompt = `You are a character design expert. The user has made their choices. Finalize the character profile.

User's brand:
${ctx.businessText}

Their chosen name: ${guidedAnswers.name}
Their chosen personality selections: ${JSON.stringify(guidedAnswers.selections)}
Their chosen appearance: ${guidedAnswers.appearanceDescription || 'professional and approachable'}

Return ONLY valid JSON:
{
  "name": "${guidedAnswers.name}",
  "selections": ${JSON.stringify(guidedAnswers.selections)},
  "nicheType": "their industry/niche",
  "nicheAudience": "their target audience",
  "missionStatement": "one sentence mission",
  "uniqueEdge": "what makes this AI unique",
  "contentPillars": ["pillar1", "pillar2", "pillar3"],
  "imagePrompt": "detailed portrait prompt for this character"
}`
      } else {
        // Auto mode — AI decides everything
        const userSpecs = body.specs ? `\n\nThe user gave these specifications:\n"${body.specs}"\nHonor these specs heavily in your design choices.\n` : ''
        systemPrompt = `You are a character design expert. Create the PERFECT AI character for this user's brand. Make every decision yourself.
${userSpecs}

Here is everything you know about them:
${ctx.businessText}

Their memories/facts:
${ctx.memoryText}

Their AI's name is: ${ctx.aiName}

Bundle catalog (pick ONE valid ID per category):
${catalog}

Return ONLY valid JSON:
{
  "name": "a name that fits their brand (can use their AI name: ${ctx.aiName})",
  "selections": {
    "identity": "id-X",
    "backstory": "bs-X",
    "energy": "en-X",
    "humor": "hu-X",
    "communication": "cm-X",
    "values": "va-X",
    "conflict": "cf-X",
    "social": "so-X",
    "ambition": "am-X",
    "creativity": "cr-X",
    "quirks": "qk-X"
  },
  "nicheType": "their industry or niche",
  "nicheAudience": "who they serve",
  "missionStatement": "one sentence about this AI's purpose",
  "uniqueEdge": "what makes this AI stand out",
  "contentPillars": ["pillar1", "pillar2", "pillar3"],
  "imagePrompt": "detailed professional portrait/headshot prompt for this character — describe appearance, style, setting, lighting"
}

Pick bundles that MATCH the user's industry, brand voice, and audience. Be opinionated. Don't play it safe.`
      }

      const response = await callLLM(systemPrompt, [
        { role: 'user', content: 'Create my AI character now.' },
      ], { maxTokens: 1500, temperature: 0.7 })

      let profile
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        profile = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      } catch {
        return NextResponse.json({ error: 'Failed to parse AI profile' }, { status: 500 })
      }

      if (!profile?.name || !profile?.selections) {
        return NextResponse.json({ error: 'AI returned incomplete profile' }, { status: 500 })
      }

      // Validate bundle IDs
      profile.selections = validateSelections(profile.selections)

      return NextResponse.json({ profile })
    }

    // -----------------------------------------
    // STEP: save-character
    // Persist the character to the database
    // -----------------------------------------
    if (step === 'save-character') {
      const { profile } = body
      if (!profile?.name || !profile?.selections) {
        return NextResponse.json({ error: 'Missing profile data' }, { status: 400 })
      }

      // Enforce 5-character limit
      const activeCount = await db.character.count({
        where: { userId: user.id, isActive: true },
      })
      if (activeCount >= 5) {
        return NextResponse.json(
          { error: 'You can have up to 5 characters. Deactivate one first.' },
          { status: 403 }
        )
      }

      // Build personality blob for backward compat
      const personality: Record<string, string> = {}
      for (const [cat, bundleId] of Object.entries(profile.selections)) {
        personality[cat] = bundleId as string
      }

      const character = await db.character.create({
        data: {
          userId: user.id,
          name: profile.name.trim(),
          selections: JSON.parse(JSON.stringify(profile.selections)),
          customizations: JSON.parse(JSON.stringify({})),
          personality: JSON.parse(JSON.stringify(personality)),
          nicheType: profile.nicheType || null,
          nicheAudience: profile.nicheAudience || null,
          missionStatement: profile.missionStatement || null,
          uniqueEdge: profile.uniqueEdge || null,
          contentPillars: JSON.parse(JSON.stringify(profile.contentPillars || [])),
          visualTraits: JSON.parse(JSON.stringify({})),
          isActive: true,
        },
      })

      return NextResponse.json({
        character: {
          id: character.id,
          name: character.name,
        },
      })
    }

    // -----------------------------------------
    // STEP: content-pack
    // Generate a week of content for the business
    // -----------------------------------------
    if (step === 'content-pack') {
      const { characterId } = body
      if (!characterId) {
        return NextResponse.json({ error: 'Missing characterId' }, { status: 400 })
      }

      const character = await db.character.findFirst({
        where: { id: characterId, userId: user.id },
      })
      if (!character) {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 })
      }

      const ctx = await getUserContext(user.id)

      // Build character personality description from selections
      const traitDesc = Object.entries(character.selections as Record<string, string>)
        .map(([cat, bundleId]) => {
          const bundle = BUNDLES.find((b) => b.id === bundleId)
          return bundle ? `${cat}: ${bundle.name} — ${bundle.desc}` : null
        })
        .filter(Boolean)
        .join('\n')

      const systemPrompt = `You are ${character.name}, an AI content creator. Generate a content pack of 5-7 social media posts for the user's business.

Character personality:
${traitDesc}

Business info:
${ctx.businessText}

Return ONLY valid JSON:
{
  "weekTheme": "theme for this week's content",
  "pieces": [
    {
      "contentType": "caption|thread|story_prompt|carousel_outline|poll|quote|tip",
      "platform": "Instagram|Twitter|LinkedIn|TikTok|Facebook",
      "content": "the full post text",
      "hashtags": ["tag1", "tag2"],
      "needsUserPhoto": true/false,
      "photoSuggestion": "what photo to take or generate",
      "daySuggestion": "Monday|Tuesday|etc"
    }
  ]
}

Rules:
- Mix platforms and content types
- Write in the character's voice/personality
- Make content specific to the user's business, not generic
- Each piece should be ready to copy-paste and post`

      const response = await callLLM(systemPrompt, [
        { role: 'user', content: 'Generate my content pack for this week.' },
      ], { maxTokens: 4096, temperature: 0.8 })

      let pack
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        pack = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      } catch {
        return NextResponse.json({ error: 'Failed to parse content pack' }, { status: 500 })
      }

      if (!pack?.pieces || !Array.isArray(pack.pieces)) {
        return NextResponse.json({ error: 'AI returned invalid content pack' }, { status: 500 })
      }

      // Charge for the pack
      const totalCents = pack.pieces.length * 15
      const charge = await chargeAmount(
        user.id,
        totalCents,
        `Content pack (${pack.pieces.length} pieces)`,
        { characterId }
      )

      return NextResponse.json({
        contentPack: {
          weekTheme: pack.weekTheme || 'Your Week',
          pieces: pack.pieces,
          totalPriceCents: charge.allowed ? totalCents : 0,
          charged: charge.allowed,
        },
      })
    }

    // -----------------------------------------
    // STEP: generate-images
    // Create 1-2 images for the character
    // -----------------------------------------
    if (step === 'generate-images') {
      const { characterId, imagePrompt } = body
      if (!characterId) {
        return NextResponse.json({ error: 'Missing characterId' }, { status: 400 })
      }

      const character = await db.character.findFirst({
        where: { id: characterId, userId: user.id },
      })
      if (!character) {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 })
      }

      // Generate the image prompt if not provided
      let prompt = imagePrompt
      if (!prompt) {
        const ctx = await getUserContext(user.id)
        const promptResponse = await callLLM(
          `You are an image prompt expert. Write a detailed image generation prompt for a professional character portrait/headshot. The character is named "${character.name}" and represents a ${ctx.business?.businessType || 'business'} brand. Return ONLY the prompt text, nothing else. Make it specific: describe the person's appearance, clothing, expression, background, lighting, and style. Keep it under 100 words.`,
          [{ role: 'user', content: 'Write the image prompt.' }],
          { maxTokens: 200, temperature: 0.7 }
        )
        prompt = promptResponse.content.trim()
      }

      // Generate 2 images (portrait + square)
      const results = await Promise.allSettled([
        generateImage(user.id, prompt, { imageSize: 'portrait_4_3' }),
        generateImage(user.id, `${prompt}, different angle, different expression`, { imageSize: 'square_hd' }),
      ])

      const imageTypes = ['head_front', 'body_front']
      const images: { url: string; prompt: string }[] = []
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled' && result.value.success && result.value.imageUrl) {
          images.push({ url: result.value.imageUrl, prompt: result.value.prompt || prompt })

          // Save to CharacterImage table
          await db.characterImage.create({
            data: {
              characterId,
              imageType: imageTypes[i] || `extra_${i}`,
              imageUrl: result.value.imageUrl,
              position: images.length - 1,
            },
          })
        }
      }

      return NextResponse.json({ images })
    }

    // -----------------------------------------
    // STEP: start-video
    // Kick off a video generation job
    // -----------------------------------------
    if (step === 'start-video') {
      const { characterId } = body
      if (!characterId) {
        return NextResponse.json({ error: 'Missing characterId' }, { status: 400 })
      }

      const result = await startVideoGeneration(user.id, characterId)
      return NextResponse.json(result)
    }

    // ============================================
    // STEP: generate-visuals — AI picks all visual traits
    // ============================================
    if (step === 'generate-visuals') {
      const { characterName, nicheType, specs } = body
      const traitCategories = TRAIT_CATEGORIES.map(c => `${c.label}: [${c.options.join(', ')}]`).join('\n')
      const userSpecs = specs ? `\nUser specifications: "${specs}"\nHonor these specs in your visual choices.\n` : ''

      const sysPrompt = `You are a character visual design expert. Pick the perfect visual traits for this AI character.
Character name: ${characterName || 'Unknown'}
Niche: ${nicheType || 'general'}
${userSpecs}
Available trait categories and options:
${traitCategories}

Return ONLY valid JSON with this structure:
{
  "description": "A vivid 2-3 sentence description of what this character looks like",
  "bodyType": "one of the body type options",
  "skinTone": "one of the skin tone options",
  "hairStyle": "one of the hair style options",
  "hairColor": "one of the hair color options",
  "eyeColor": "one of the eye color options",
  "facialHair": "one of the facial hair options or empty string",
  "clothing": "one of the clothing options",
  "accessories": "one of the accessories options or empty string",
  "expression": "one of the expression options",
  "background": "one of the background options"
}`

      const res = await callLLM(sysPrompt, [{ role: 'user', content: 'Generate the visual traits now.' }], { temperature: 0.9 })
      const text = String(res.content)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse visual traits' }, { status: 500 })
      const traits = JSON.parse(jsonMatch[0])
      return NextResponse.json({ traits })
    }

    // ============================================
    // STEP: generate-talking-profile
    // ============================================
    if (step === 'generate-talking-profile') {
      const { characterName, specs } = body

      const profileList = TALKING_PROFILES.map(p => 
        `- id: "${p.id}", name: "${p.name}", desc: "${p.desc}", tag: "${p.tag}", defaults: energy=${p.defaults.energy} formality=${p.defaults.formality} pace=${p.defaults.pace} warmth=${p.defaults.warmth} humor=${p.defaults.humor}`
      ).join('\n')

      const sysPrompt = `You are an AI voice personality matcher. Given a character and optional user specs, pick the best talking profile and fine-tune the slider values.

Available profiles:
${profileList}

Return ONLY valid JSON with this exact structure:
{
  "profileId": "tp-X",
  "sliders": { "energy": 0-100, "formality": 0-100, "pace": 0-100, "warmth": 0-100, "humor": 0-100 }
}

Pick the profile that best matches the character's personality. Adjust sliders from the defaults to better fit. If user specs mention voice preferences, prioritize those.`

      const userMsg = `Character: ${characterName || 'Unknown'}
User specs: ${specs || 'None provided — use your best judgment'}`

      const res = await callLLM(sysPrompt, [{ role: 'user', content: userMsg }], { temperature: 0.7 })
      const text = String(res.content)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse talking profile' }, { status: 500 })
      const result = JSON.parse(jsonMatch[0])
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unknown step' }, { status: 400 })

  } catch (err: any) {
    console.error('POST /api/characters/ai-create error:', err?.message)
    return NextResponse.json(
      { error: err?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
