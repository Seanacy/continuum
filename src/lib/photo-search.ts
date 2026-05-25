// Photo Search Engine
// Takes a content idea's search query, finds REAL photos via Tavily
// Returns structured results for user approval before Gemini recreation

import { searchImages } from '@/lib/tavily'
import type { ContentIdea } from '@/lib/content-idea-engine'

// A photo found on the web, ready for user approval
export interface PhotoCandidate {
  id: string
  imageUrl: string       // direct URL to the photo
  searchQuery: string    // what we searched for
  ideaId: string         // which content idea this belongs to
  status: 'pending' | 'approved' | 'rejected'
}

// Result of searching for photos for a content idea
export interface PhotoSearchResult {
  ideaId: string
  ideaTitle: string
  searchQuery: string
  candidates: PhotoCandidate[]
  searchedAt: string     // ISO timestamp
}

// Search for photos matching a single content idea
export async function searchPhotosForIdea(
  idea: ContentIdea,
  maxResults: number = 5
): Promise<PhotoSearchResult> {
  const query = idea.photoSearchQuery
  
  try {
    const response = await searchImages(query, maxResults)
    
    const candidates: PhotoCandidate[] = response.images.map((url, i) => ({
      id: idea.id + '-photo-' + i,
      imageUrl: url,
      searchQuery: query,
      ideaId: idea.id,
      status: 'pending' as const,
    }))
    
    return {
      ideaId: idea.id,
      ideaTitle: idea.title,
      searchQuery: query,
      candidates,
      searchedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Photo search failed for idea:', idea.title, error)
    return {
      ideaId: idea.id,
      ideaTitle: idea.title,
      searchQuery: query,
      candidates: [],
      searchedAt: new Date().toISOString(),
    }
  }
}

// Search for photos for multiple content ideas at once
export async function searchPhotosForIdeas(
  ideas: ContentIdea[],
  maxResultsPerIdea: number = 5
): Promise<PhotoSearchResult[]> {
  // Run searches in parallel (but limit concurrency to avoid rate limits)
  const results: PhotoSearchResult[] = []
  
  // Process 3 at a time to be nice to Tavily's API
  const batchSize = 3
  for (let i = 0; i < ideas.length; i += batchSize) {
    const batch = ideas.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(idea => searchPhotosForIdea(idea, maxResultsPerIdea))
    )
    results.push(...batchResults)
  }
  
  return results
}

// Refine a search query if initial results weren't good
// Adds more specific terms to narrow down the results
export async function refinePhotoSearch(
  originalQuery: string,
  ideaId: string,
  refinement: string,  // e.g. "outdoor", "close-up", "nighttime"
  maxResults: number = 5
): Promise<PhotoSearchResult> {
  const refinedQuery = originalQuery + ' ' + refinement
  
  try {
    const response = await searchImages(refinedQuery, maxResults)
    
    const candidates: PhotoCandidate[] = response.images.map((url, i) => ({
      id: ideaId + '-refined-' + Date.now() + '-' + i,
      imageUrl: url,
      searchQuery: refinedQuery,
      ideaId,
      status: 'pending' as const,
    }))
    
    return {
      ideaId,
      ideaTitle: '',
      searchQuery: refinedQuery,
      candidates,
      searchedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Refined photo search failed:', error)
    return {
      ideaId,
      ideaTitle: '',
      searchQuery: refinedQuery,
      candidates: [],
      searchedAt: new Date().toISOString(),
    }
  }
}

// Validate that a photo URL is still accessible
export async function validatePhotoUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const contentType = res.headers.get('content-type') || ''
    return res.ok && contentType.startsWith('image/')
  } catch {
    return false
  }
}

// Filter out dead image URLs from candidates
export async function filterValidCandidates(
  candidates: PhotoCandidate[]
): Promise<PhotoCandidate[]> {
  const validChecks = await Promise.all(
    candidates.map(async (c) => ({
      candidate: c,
      isValid: await validatePhotoUrl(c.imageUrl),
    }))
  )
  return validChecks.filter(v => v.isValid).map(v => v.candidate)
}
