// ============================================
// VISUAL TRAITS — options for character appearance
// All <select> elements for AI agent accessibility
// ============================================

// ---- FACE TRAITS ----
export const SKIN_COMPLEXIONS = [
  'Fair / Porcelain',
  'Light',
  'Medium / Olive',
  'Tan',
  'Brown',
  'Dark Brown',
  'Deep / Ebony',
] as const

export const HAIR_COLORS = [
  'Black',
  'Dark Brown',
  'Medium Brown',
  'Light Brown',
  'Blonde',
  'Platinum Blonde',
  'Red / Auburn',
  'Ginger',
  'Gray / Silver',
  'White',
  'Blue',
  'Pink',
  'Purple',
  'Green',
  'Multicolor',
] as const

export const HAIR_STYLES = [
  'Short Cropped',
  'Buzz Cut',
  'Pixie Cut',
  'Bob',
  'Shoulder Length',
  'Long Straight',
  'Long Wavy',
  'Long Curly',
  'Afro',
  'Braids',
  'Locs / Dreadlocks',
  'Ponytail',
  'Bun / Updo',
  'Mohawk',
  'Bald / Shaved',
  'Slicked Back',
] as const

export const EYE_COLORS = [
  'Dark Brown',
  'Light Brown / Hazel',
  'Green',
  'Blue',
  'Gray',
  'Amber',
  'Black',
] as const

export const NOSE_TYPES = [
  'Button',
  'Straight / Narrow',
  'Wide / Broad',
  'Aquiline / Roman',
  'Upturned',
  'Flat / Low Bridge',
  'Round / Bulbous',
] as const

export const LIP_TYPES = [
  'Full',
  'Thin',
  'Medium',
  'Heart-shaped',
  'Wide',
  'Bow-shaped',
] as const

// ---- BODY TRAITS ----
export const HEIGHTS = [
  'Short (under 5\'4")',
  'Average (5\'4" - 5\'8")',
  'Tall (5\'9" - 6\'1")',
  'Very Tall (6\'2"+)',
] as const

export const BODY_TYPES = [
  'Slim / Lean',
  'Athletic / Toned',
  'Average',
  'Curvy / Hourglass',
  'Muscular / Built',
  'Plus Size',
  'Stocky / Sturdy',
  'Petite',
] as const

export const SKIN_TONES = [
  'Same as face complexion',
  'Slightly tanned',
  'Heavily tanned',
  'Tattoos visible',
  'Freckled',
] as const

export const CLOTHING_STYLES = [
  'Streetwear / Urban',
  'Casual / Relaxed',
  'Athleisure / Sporty',
  'Business Casual',
  'Formal / Professional',
  'Bohemian / Free Spirit',
  'Minimalist / Clean',
  'Glamorous / High Fashion',
  'Edgy / Alternative',
  'Preppy / Classic',
] as const

// ---- TYPES ----
export interface VisualTraits {
  // Face
  skinComplexion?: string
  hairColor?: string
  hairStyle?: string
  eyeColor?: string
  noseType?: string
  lipType?: string
  // Body
  height?: string
  bodyType?: string
  skinTone?: string
  clothingStyle?: string
  // Free-text
  description?: string
}

export interface TraitCategory {
  key: keyof VisualTraits
  label: string
  group: 'face' | 'body'
  options: readonly string[]
}

// Ordered list of all trait categories for the wizard
export const TRAIT_CATEGORIES: TraitCategory[] = [
  { key: 'skinComplexion', label: 'Skin Complexion', group: 'face', options: SKIN_COMPLEXIONS },
  { key: 'hairColor', label: 'Hair Color', group: 'face', options: HAIR_COLORS },
  { key: 'hairStyle', label: 'Hair Style', group: 'face', options: HAIR_STYLES },
  { key: 'eyeColor', label: 'Eye Color', group: 'face', options: EYE_COLORS },
  { key: 'noseType', label: 'Nose Type', group: 'face', options: NOSE_TYPES },
  { key: 'lipType', label: 'Lip Type', group: 'face', options: LIP_TYPES },
  { key: 'height', label: 'Height', group: 'body', options: HEIGHTS },
  { key: 'bodyType', label: 'Body Type', group: 'body', options: BODY_TYPES },
  { key: 'skinTone', label: 'Skin Tone (Body)', group: 'body', options: SKIN_TONES },
  { key: 'clothingStyle', label: 'Clothing Style', group: 'body', options: CLOTHING_STYLES },
]

// Helper: count how many traits are filled
export function countFilledTraits(traits: VisualTraits): number {
  return TRAIT_CATEGORIES.filter(c => traits[c.key]).length
}
