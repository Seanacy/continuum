// ============================================
// Orbit Network Graph & Relationship Management
// ============================================
// Builds network visualization data from orbit
// characters, relationships, and interactions.
// ============================================

import { db } from '@/lib/db';

// ============================================
// Types
// ============================================

export interface NetworkNode {
  id: string;
  name: string;
  role: string;
  platform: string;
  style: string;
  connectionCount: number;
  interactionCount: number;
  color: string;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
  relationshipType: string;
  strength: number;
  interactionCount: number;
  lastInteraction: string | null;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  stats: NetworkStats;
}

export interface NetworkStats {
  totalCharacters: number;
  totalRelationships: number;
  totalInteractions: number;
  mostConnected: { name: string; connections: number } | null;
  mostActive: { name: string; interactions: number } | null;
  strongestBond: { from: string; to: string; strength: number } | null;
}

// ============================================
// Role color mapping
// ============================================

const ROLE_COLORS: Record<string, string> = {
  thought_leader: '#8b5cf6',
  entertainer: '#ec4899',
  educator: '#3b82f6',
  curator: '#10b981',
  provocateur: '#f59e0b',
  community_builder: '#6366f1',
};

// ============================================
// Build network graph from orbit data
// ============================================

export async function getOrbitNetwork(
  projectId: string,
  userId: string
): Promise<NetworkGraph> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
    include: {
      characters: {
        include: {
          relationshipsAsA: true,
          relationshipsAsB: true,
        }
      }
    },
  });

  if (!project) {
    return {
      nodes: [],
      edges: [],
      stats: {
        totalCharacters: 0,
        totalRelationships: 0,
        totalInteractions: 0,
        mostConnected: null,
        mostActive: null,
        strongestBond: null,
      },
    };
  }

  const characters = project.characters as any[];
  const allRels = (characters as any[]).flatMap((c: any) => [...(c.relationshipsAsA || []), ...(c.relationshipsAsB || [])]);
  const seenIds = new Set<string>();
  const relationships = allRels.filter((r: any) => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true; })

  // Get interactions from strategy table
  const strategy = (project as any).strategyTable || [];

  const interactions = (strategy?.interactions as any[] | null) || [];

  // ============================================
  // Build nodes
  // ============================================

  const connectionCounts: Record<string, number> = {};
  const interactionCounts: Record<string, number> = {};

  relationships.forEach((rel: any) => {
    connectionCounts[rel.characterAId] = (connectionCounts[rel.characterAId] || 0) + 1;
    connectionCounts[rel.characterBId] = (connectionCounts[rel.characterBId] || 0) + 1;
  });

  interactions.forEach((ix: any) => {
    interactionCounts[ix.fromCharacterId] = (interactionCounts[ix.fromCharacterId] || 0) + 1;
    if (ix.toCharacterId) {
      interactionCounts[ix.toCharacterId] = (interactionCounts[ix.toCharacterId] || 0) + 1;
    }
  });

  const nodes: NetworkNode[] = characters.map((char: any) => ({
    id: char.id,
    name: char.name,
    role: char.role || 'unknown',
    platform: char.platform || 'multi',
    style: char.style || '',
    connectionCount: connectionCounts[char.id] || 0,
    interactionCount: interactionCounts[char.id] || 0,
    color: ROLE_COLORS[char.role] || '#71717a',
  }));

  // ============================================
  // Build edges
  // ============================================

  const edgeInteractionCounts: Record<string, number> = {};
  const edgeLastInteraction: Record<string, string> = {};

  interactions.forEach((ix: any) => {
    const key1 = `${ix.fromCharacterId}-${ix.toCharacterId}`;
    const key2 = `${ix.toCharacterId}-${ix.fromCharacterId}`;
    const existingKey = edgeInteractionCounts[key1] !== undefined ? key1 : key2;
    const useKey = edgeInteractionCounts[existingKey] !== undefined ? existingKey : key1;

    edgeInteractionCounts[useKey] = (edgeInteractionCounts[useKey] || 0) + 1;

    if (!edgeLastInteraction[useKey] || ix.createdAt > edgeLastInteraction[useKey]) {
      edgeLastInteraction[useKey] = ix.createdAt;
    }
  });

  const charMap = new Map(characters.map((c: any) => [c.id, c.name]));

  const edges: NetworkEdge[] = relationships.map((rel: any) => {
    const key1 = `${rel.characterAId}-${rel.characterBId}`;
    const key2 = `${rel.characterBId}-${rel.characterAId}`;
    const ixCount = edgeInteractionCounts[key1] || edgeInteractionCounts[key2] || 0;
    const lastIx = edgeLastInteraction[key1] || edgeLastInteraction[key2] || null;

    const baseStrength = rel.dynamic === 'allies' ? 3 :
      rel.dynamic === 'rivals' ? 2 :
      rel.dynamic === 'mentor_mentee' ? 3 :
      rel.dynamic === 'collaborators' ? 4 :
      rel.dynamic === 'frenemies' ? 2 :
      rel.dynamic === 'complementary' ? 3 :
      rel.dynamic === 'competitive' ? 2 : 1;

    const interactionBonus = Math.min(ixCount * 0.5, 3);
    const strength = Math.min(baseStrength + interactionBonus, 10);

    return {
      id: rel.id,
      source: rel.characterAId,
      target: rel.characterBId,
      sourceLabel: charMap.get(rel.characterAId) || 'Unknown',
      targetLabel: charMap.get(rel.characterBId) || 'Unknown',
      relationshipType: rel.dynamic || 'neutral',
      strength,
      interactionCount: ixCount,
      lastInteraction: lastIx,
    };
  });

  // ============================================
  // Compute stats
  // ============================================

  const mostConnected = nodes.reduce<{ name: string; connections: number } | null>(
    (best, node) => {
      if (!best || node.connectionCount > best.connections) {
        return { name: node.name, connections: node.connectionCount };
      }
      return best;
    },
    null
  );

  const mostActive = nodes.reduce<{ name: string; interactions: number } | null>(
    (best, node) => {
      if (!best || node.interactionCount > best.interactions) {
        return { name: node.name, interactions: node.interactionCount };
      }
      return best;
    },
    null
  );

  const strongestBond = edges.reduce<{ from: string; to: string; strength: number } | null>(
    (best, edge) => {
      if (!best || edge.strength > best.strength) {
        return { from: edge.sourceLabel, to: edge.targetLabel, strength: edge.strength };
      }
      return best;
    },
    null
  );

  const stats: NetworkStats = {
    totalCharacters: nodes.length,
    totalRelationships: edges.length,
    totalInteractions: interactions.length,
    mostConnected,
    mostActive,
    strongestBond,
  };

  return { nodes, edges, stats };
}

// ============================================
// Update relationship dynamic between characters
// ============================================

export async function updateOrbitRelationship(
  projectId: string,
  userId: string,
  relationshipId: string,
  dynamic: string
): Promise<{ success: boolean }> {
  const project = await db.orbitProject.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return { success: false };
  }

  await db.orbitRelationship.update({
    where: { id: relationshipId },
    data: { dynamic },
  });

  return { success: true };
}

// ============================================
// Get relationship types for display
// ============================================

export const RELATIONSHIP_TYPES = [
  { value: 'allies', label: 'Allies', color: '#10b981', description: 'Supportive and collaborative' },
  { value: 'rivals', label: 'Rivals', color: '#ef4444', description: 'Competitive tension' },
  { value: 'mentor_mentee', label: 'Mentor / Mentee', color: '#3b82f6', description: 'Teaching relationship' },
  { value: 'collaborators', label: 'Collaborators', color: '#8b5cf6', description: 'Working together closely' },
  { value: 'frenemies', label: 'Frenemies', color: '#f59e0b', description: 'Friendly rivalry' },
  { value: 'complementary', label: 'Complementary', color: '#06b6d4', description: 'Different strengths that pair well' },
  { value: 'competitive', label: 'Competitive', color: '#ec4899', description: 'Healthy competition' },
];
