// Content Idea Engine
// Reads character traits, personality, and business goals
// Generates content ideas with photo search descriptions
// Each idea feeds into the photo search + Gemini recreation pipeline

import { callLLM } from '@/lib/llm'
import { db } from '@/lib/db'
import { BUNDLES, CATEGORIES } from '@/lib/bundles'

// A single content idea ready for the pipeline
export interface ContentIdea {
  id: string
  title: string
  caption: string           // social media caption
  photoSearchQuery: string  // what to search for on the web
  sceneDescription: string  // detailed scene for Gemini to recreate
  mood: string              // emotional tone
  category: string          // which trait category inspired this
  businessTie?: string      // how it connects to the business (if any)
}

// Input: everything we know about the character + their business
interface IdeaGeneratorInput {
  character: {
    id: string
    name: string
    personality: Record<string, any>
    backstory?: string | null
    interests: string[]
    selections: Record<string, string>  // bundle selections by category
    customizations: Record<string, any>
  }
  business?: {
    name: string
    businessType?: string | null
    productsServices?: string | null
    targetAudience?: string | null
    brandVoice?: string | null
  } | null
  count?: number  // how many ideas to generate (default 5)
}

// Resolve bundle selections into readable trait names
function resolveTraitNames(selections: Record<string, string>): string[] {
  const traits: string[] = []
  for (const [categoryKey, bundleId] of Object.entries(selections)) {
    const category = CATEGORIES.find(c => c.key === categoryKey)
    const allBundles = (BUNDLES as unknown as Record<string, any[]>)[categoryKey] || []
    const bundle = allBundles.find((b: any) => b.id === bundleId)
    if (category && bundle) {
      traits.push(category.label + ': ' + bundle.name + ' — ' + bundle.desc)
    }
  }
  return traits
}

// Build the prompt that tells Claude what kind of content to generate
function buildIdeaPrompt(input: IdeaGeneratorInput): string {
  const { character, business, count = 5 } = input
  const traits = resolveTraitNames(character.selections || {})
  
  let prompt = 'You are a creative content strategist for social media influencers and brands.\n\n'
  prompt += 'CHARACTER PROFILE:\n'
  prompt += 'Name: ' + character.name + '\n'
  
  if (traits.length > 0) {
    prompt += '\nPersonality Traits:\n'
    traits.forEach(t => { prompt += '- ' + t + '\n' })
  }
  
  if (character.backstory) {
    prompt += '\nBackstory: ' + character.backstory + '\n'
  }
  
  if (character.interests && character.interests.length > 0) {
    prompt += '\nInterests: ' + character.interests.join(', ') + '\n'
  }
  
  const personality = character.personality || {}
  if (personality.quirks) {
    prompt += '\nQuirks: ' + personality.quirks + '\n'
  }
  if (personality.catchphrases) {
    prompt += '\nCatchphrases: ' + JSON.stringify(personality.catchphrases) + '\n'
  }
  
  if (business) {
    prompt += '\nBUSINESS CONTEXT:\n'
    prompt += 'Business: ' + business.name + '\n'
    if (business.businessType) prompt += 'Type: ' + business.businessType + '\n'
    if (business.productsServices) prompt += 'Products/Services: ' + business.productsServices + '\n'
    if (business.targetAudience) prompt += 'Target Audience: ' + business.targetAudience + '\n'
    if (business.brandVoice) prompt += 'Brand Voice: ' + business.brandVoice + '\n'
  }
  
  prompt += '\nGENERATE ' + count + ' CONTENT IDEAS.\n\n'
  prompt += 'For each idea, provide:\n'
  prompt += '1. title — short, catchy name for the content piece\n'
  prompt += '2. caption — the social media caption/text to post with it\n'
  prompt += '3. photoSearchQuery — a specific search query to find a REAL photo on the web that matches this scene (e.g. "woman eating ramen at Japanese street stall night" not vague like "food photo")\n'
  prompt += '4. sceneDescription — a detailed description of the exact scene for AI image generation. Describe the setting, lighting, pose, clothing, background, and mood. Be VERY specific about every visual detail.\n'
  prompt += '5. mood — the emotional tone (e.g. "cozy and nostalgic", "bold and confident")\n'
  prompt += '6. category — which personality trait or interest inspired this idea\n'
  if (business) {
    prompt += '7. businessTie — how this content subtly promotes or relates to the business (not salesy, natural)\n'
  }
  
  prompt += '\nIMPORTANT RULES:\n'
  prompt += '- Ideas should feel AUTHENTIC to this character, not generic\n'
  prompt += '- Mix personal/lifestyle content with business content (if business provided)\n'
  prompt += '- Photo search queries must describe REAL photos that exist on the web\n'
  prompt += '- Scene descriptions should be detailed enough that an AI could recreate the exact scene\n'
  prompt += '- Each idea should be different — vary locations, activities, moods\n'
  prompt += '- Think about what would actually perform well on Instagram/TikTok\n'
  
  prompt += '\nRespond with a JSON array of objects. No markdown, just valid JSON.\n'
  prompt += 'Example format: [{"title":"...","caption":"...","photoSearchQuery":"...","sceneDescription":"...","mood":"...","category":"..."' + (business ? ',"businessTie":"..."' : '') + '}]'
  
  return prompt
}

// Main function: generate content ideas for a character
export async function generateContentIdeas(input: IdeaGeneratorInput): Promise<ContentIdea[]> {
  const prompt = buildIdeaPrompt(input)
  const count = input.count || 5
  
  const response = await callLLM({
    system: 'You are a creative content strategist. Respond ONLY with valid JSON arrays. No markdown, no explanation.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 3000,
  })
  
  // Parse the JSON response
  let ideas: any[] = []
  try {
    // Extract JSON from response (handle if wrapped in markdown code blocks)
    let jsonStr = response.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '')
    }
    ideas = JSON.parse(jsonStr)
  } catch (e) {
    console.error('Failed to parse content ideas JSON:', e)
    return []
  }
  
  // Validate and add IDs
  return ideas.slice(0, count).map((idea: any, i: number) => ({
    id: input.character.id + '-idea-' + Date.now() + '-' + i,
    title: idea.title || 'Untitled',
    caption: idea.caption || '',
    photoSearchQuery: idea.photoSearchQuery || '',
    sceneDescription: idea.sceneDescription || '',
    mood: idea.mood || 'neutral',
    category: idea.category || 'general',
    businessTie: idea.businessTie || undefined,
  }))
}

// Convenience: load character + business from DB and generate ideas
export async function generateIdeasForCharacter(
  characterId: string,
  businessId?: string,
  count: number = 5
): Promise<ContentIdea[]> {
  // Load character
  const character = await db.character.findUnique({
    where: { id: characterId }
  })
  
  if (!character) {
    throw new Error('Character not found: ' + characterId)
  }
  
  // Load business if provided
  let business = null
  if (businessId) {
    business = await db.business.findUnique({
      where: { id: businessId }
    })
  }
  
  return generateContentIdeas({
    character: {
      id: character.id,
      name: character.name,
      personality: (character.personality as Record<string, any>) || {},
      backstory: character.backstory,
      interests: (character.interests as string[]) || [],
      selections: (character.selections as Record<string, string>) || {},
      customizations: (character.customizations as Record<string, any>) || {},
    },
    business: business ? {
      name: business.name,
      businessType: business.businessType,
      productsServices: business.productsServices,
      targetAudience: business.targetAudience,
      brandVoice: business.brandVoice,
    } : null,
    count,
  })
}
