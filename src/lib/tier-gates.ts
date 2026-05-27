// ============================================
// TIER GATING — controls what each subscription tier can access
// Import this anywhere you need to check permissions
// ============================================

export type Tier = 'free' | 'creator' | 'studio';

export interface TierLimits {
  maxCharacters: number;
  maxMessagesPerDay: number;
  contentPacks: boolean;
  imageGen: boolean;
  videoGen: boolean;
  orbitProjects: number; // 0 = no access
  maxBusinesses: number;
  walletTopUps: boolean;
  prioritySupport: boolean;
}

const TIER_CONFIG: Record<Tier, TierLimits> = {
  free: {
    maxCharacters: 1,
    maxMessagesPerDay: 5,
    contentPacks: false,
    imageGen: false,
    videoGen: false,
    orbitProjects: 0,
    maxBusinesses: 0,
    walletTopUps: false,
    prioritySupport: false,
  },
  creator: {
    maxCharacters: 1,
    maxMessagesPerDay: 30,
    contentPacks: true,
    imageGen: true,
    videoGen: false,
    orbitProjects: 1,
    maxBusinesses: 1,
    walletTopUps: true,
    prioritySupport: false,
  },
  studio: {
    maxCharacters: 999, // effectively unlimited
    maxMessagesPerDay: 999,
    contentPacks: true,
    imageGen: true,
    videoGen: true,
    orbitProjects: 999,
    maxBusinesses: 999,
    walletTopUps: true,
    prioritySupport: true,
  },
};

// Get the limits for a tier
export function getTierLimits(tier: string): TierLimits {
  return TIER_CONFIG[(tier as Tier)] || TIER_CONFIG.free;
}

// Check if a specific feature is available
export function canAccess(tier: string, feature: keyof TierLimits): boolean {
  const limits = getTierLimits(tier);
  const value = limits[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return false;
}

// Check if user has hit their daily message limit
export function canSendMessage(tier: string, messagesToday: number): boolean {
  const limits = getTierLimits(tier);
  return messagesToday < limits.maxMessagesPerDay;
}

// Check if user can create another character
export function canCreateCharacter(tier: string, currentCount: number): boolean {
  const limits = getTierLimits(tier);
  return currentCount < limits.maxCharacters;
}

// Check if user can create another Orbit project
export function canCreateOrbitProject(tier: string, currentCount: number): boolean {
  const limits = getTierLimits(tier);
  return currentCount < limits.orbitProjects;
}

// Check if user can add another business
export function canAddBusiness(tier: string, currentCount: number): boolean {
  const limits = getTierLimits(tier);
  return currentCount < limits.maxBusinesses;
}

// Get the minimum tier required for a feature
export function requiredTier(feature: keyof TierLimits): Tier {
  if (canAccess('free', feature)) return 'free';
  if (canAccess('creator', feature)) return 'creator';
  return 'studio';
}

// Human-readable tier names for UI
export const TIER_NAMES: Record<Tier, string> = {
  free: 'Free',
  creator: 'Creator',
  studio: 'Studio',
};

// Pricing info for UI
export const TIER_PRICES: Record<Tier, { monthly: number; label: string }> = {
  free: { monthly: 0, label: 'Free' },
  creator: { monthly: 4.99, label: '$4.99/mo' },
  studio: { monthly: 29, label: '$29/mo' },
};

// Wallet top-up options for UI
export const WALLET_OPTIONS = [
  { key: 'wallet_5', amount: 5, label: '$5' },
  { key: 'wallet_10', amount: 10, label: '$10' },
  { key: 'wallet_25', amount: 25, label: '$25' },
] as const;
