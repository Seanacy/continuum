import { db } from '@/lib/db';
import { generateIdeasForCharacter, ContentIdea } from '@/lib/content-idea-engine';
import { searchPhotosForIdeas, PhotoCandidate, PhotoSearchResult, filterValidCandidates } from '@/lib/photo-search';
import { recreateScene, SceneRecreationResult } from '@/lib/scene-recreator';
import { getCharacterReferenceImage, buildCharacterDescription } from '@/lib/scene-recreator';
import { getQuotaStats } from '@/lib/image-quota';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineConfig {
  userId: string;
  characterId: string;
  autoMode: boolean;        // true = AI decides everything, no user approval needed
  ideaCount?: number;       // how many ideas to generate (default 5)
  photosPerIdea?: number;   // how many photo candidates per idea (default 6)
  skipVideo?: boolean;      // skip Higgsfield animation step (default true for now)
}

export interface PipelineState {
  status: 'idle' | 'generating_ideas' | 'searching_photos' | 'awaiting_photo_approval' | 'recreating_scene' | 'awaiting_scene_approval' | 'complete' | 'error';
  ideas: ContentIdea[];
  photoResults: PhotoSearchResult[];
  approvedPhotos: ApprovedPhoto[];
  sceneResults: SceneResult[];
  currentIdeaIndex: number;
  currentPhotoIndex: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ApprovedPhoto {
  ideaId: string;
  ideaTitle: string;
  photoUrl: string;
  sceneDescription: string;
}

export interface SceneResult {
  ideaId: string;
  ideaTitle: string;
  originalPhotoUrl: string;
  recreatedImageUrl?: string;
  tier: string;
  costCents: number;
  success: boolean;
  error?: string;
}

export interface PipelineEvent {
  type: 'status_change' | 'idea_generated' | 'photos_found' | 'photo_approved' | 'scene_created' | 'error' | 'complete';
  data: any;
  timestamp: string;
}

// ─── Pipeline Class ──────────────────────────────────────────────────────────

export class ContentPipeline {
  private config: PipelineConfig;
  private state: PipelineState;
  private events: PipelineEvent[] = [];
  private onEvent?: (event: PipelineEvent) => void;

  constructor(config: PipelineConfig, onEvent?: (event: PipelineEvent) => void) {
    this.config = {
      ideaCount: 5,
      photosPerIdea: 6,
      skipVideo: true,
      ...config,
    };
    this.onEvent = onEvent;
    this.state = {
      status: 'idle',
      ideas: [],
      photoResults: [],
      approvedPhotos: [],
      sceneResults: [],
      currentIdeaIndex: 0,
      currentPhotoIndex: 0,
      startedAt: new Date().toISOString(),
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Start the full pipeline. In auto mode, runs to completion. In manual mode, pauses for approvals. */
  async start(): Promise<PipelineState> {
    try {
      // Step 1: Generate content ideas
      await this.generateIdeas();

      // Step 2: Search photos for all ideas
      await this.searchPhotos();

      // Step 3: If auto mode, approve best photos automatically
      if (this.config.autoMode) {
        this.autoApprovePhotos();
      } else {
        // In manual mode, pause here — UI will call approvePhoto() / rejectPhoto()
        this.setStatus('awaiting_photo_approval');
        return this.state;
      }

      // Step 4: Recreate scenes for all approved photos
      await this.recreateScenes();

      // Done
      this.setStatus('complete');
      this.state.completedAt = new Date().toISOString();
      this.emit({ type: 'complete', data: { sceneResults: this.state.sceneResults } });

      return this.state;
    } catch (error: any) {
      this.state.status = 'error';
      this.state.error = error.message || 'Pipeline failed';
      this.emit({ type: 'error', data: { error: this.state.error } });
      return this.state;
    }
  }

  /** Manual mode: approve a photo for the current idea */
  async approvePhoto(photoUrl: string): Promise<PipelineState> {
    const currentIdea = this.state.ideas[this.state.currentIdeaIndex];
    if (!currentIdea) {
      this.state.error = 'No current idea to approve photo for';
      return this.state;
    }

    this.state.approvedPhotos.push({
      ideaId: currentIdea.id,
      ideaTitle: currentIdea.title,
      photoUrl,
      sceneDescription: currentIdea.sceneDescription,
    });

    this.emit({ type: 'photo_approved', data: { ideaId: currentIdea.id, photoUrl } });

    // Move to next idea
    this.state.currentIdeaIndex++;
    this.state.currentPhotoIndex = 0;

    // If all ideas have approved photos, move to scene recreation
    if (this.state.currentIdeaIndex >= this.state.ideas.length) {
      await this.recreateScenes();
      this.setStatus('complete');
      this.state.completedAt = new Date().toISOString();
      this.emit({ type: 'complete', data: { sceneResults: this.state.sceneResults } });
    }

    return this.state;
  }

  /** Manual mode: reject current photo, show next candidate */
  rejectPhoto(): PipelineState {
    this.state.currentPhotoIndex++;

    const currentIdea = this.state.ideas[this.state.currentIdeaIndex];
    const photoResult = this.state.photoResults.find(r => r.ideaId === currentIdea?.id);

    // If no more candidates for this idea, move to next idea without a photo
    if (photoResult && this.state.currentPhotoIndex >= photoResult.candidates.length) {
      this.state.currentIdeaIndex++;
      this.state.currentPhotoIndex = 0;
    }

    // If we've gone through all ideas, recreate scenes for whatever was approved
    if (this.state.currentIdeaIndex >= this.state.ideas.length) {
      if (this.state.approvedPhotos.length > 0) {
        this.recreateScenes().then(() => {
          this.setStatus('complete');
          this.state.completedAt = new Date().toISOString();
          this.emit({ type: 'complete', data: { sceneResults: this.state.sceneResults } });
        });
      } else {
        this.setStatus('complete');
        this.state.completedAt = new Date().toISOString();
      }
    }

    return this.state;
  }

  /** Manual mode: skip the entire current idea */
  skipIdea(): PipelineState {
    this.state.currentIdeaIndex++;
    this.state.currentPhotoIndex = 0;

    if (this.state.currentIdeaIndex >= this.state.ideas.length) {
      if (this.state.approvedPhotos.length > 0) {
        this.recreateScenes().then(() => {
          this.setStatus('complete');
          this.state.completedAt = new Date().toISOString();
        });
      } else {
        this.setStatus('complete');
        this.state.completedAt = new Date().toISOString();
      }
    }

    return this.state;
  }

  /** Get current state (for UI polling) */
  getState(): PipelineState {
    return { ...this.state };
  }

  /** Get current photo candidate being shown to user */
  getCurrentCandidate(): { idea: ContentIdea; candidate: PhotoCandidate } | null {
    const idea = this.state.ideas[this.state.currentIdeaIndex];
    if (!idea) return null;

    const photoResult = this.state.photoResults.find(r => r.ideaId === idea.id);
    if (!photoResult) return null;

    const candidate = photoResult.candidates[this.state.currentPhotoIndex];
    if (!candidate) return null;

    return { idea, candidate };
  }

  /** Get quota info for display */
  async getQuotaInfo() {
    return getQuotaStats();
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private async generateIdeas(): Promise<void> {
    this.setStatus('generating_ideas');

    const ideas = await generateIdeasForCharacter(
      this.config.characterId,
      this.config.userId,
      this.config.ideaCount
    );

    this.state.ideas = ideas;
    this.emit({ type: 'idea_generated', data: { count: ideas.length, ideas } });
  }

  private async searchPhotos(): Promise<void> {
    this.setStatus('searching_photos');

    const results = await searchPhotosForIdeas(
      this.state.ideas,
      this.config.photosPerIdea
    );

    // Filter out dead URLs
    const validatedResults: PhotoSearchResult[] = [];
    for (const result of results) {
      const validCandidates = await filterValidCandidates(result.candidates);
      validatedResults.push({ ...result, candidates: validCandidates });
    }

    this.state.photoResults = validatedResults;
    this.emit({ type: 'photos_found', data: { results: validatedResults } });
  }

  private autoApprovePhotos(): void {
    // In auto mode, pick the first valid candidate for each idea
    for (const idea of this.state.ideas) {
      const photoResult = this.state.photoResults.find(r => r.ideaId === idea.id);
      if (photoResult && photoResult.candidates.length > 0) {
        this.state.approvedPhotos.push({
          ideaId: idea.id,
          ideaTitle: idea.title,
          photoUrl: photoResult.candidates[0].imageUrl,
          sceneDescription: idea.sceneDescription,
        });
      }
    }

    this.emit({
      type: 'photo_approved',
      data: { autoMode: true, count: this.state.approvedPhotos.length },
    });
  }

  private async recreateScenes(): Promise<void> {
    this.setStatus('recreating_scene');

    const characterRefUrl = await getCharacterReferenceImage(this.config.characterId);
    const characterDesc = await buildCharacterDescription(this.config.characterId);

    for (const approved of this.state.approvedPhotos) {
      try {
        const result: SceneRecreationResult = await recreateScene({
          userId: this.config.userId,
          characterId: this.config.characterId,
          scenePhotoUrl: approved.photoUrl,
          characterReferenceUrl: characterRefUrl || '',
          sceneDescription: approved.sceneDescription,
          characterDescription: characterDesc,
          contentIdeaId: approved.ideaId,
        });

        this.state.sceneResults.push({
          ideaId: approved.ideaId,
          ideaTitle: approved.ideaTitle,
          originalPhotoUrl: approved.photoUrl,
          recreatedImageUrl: result.imageUrl,
          tier: result.tier,
          costCents: result.costCents,
          success: result.success,
          error: result.error,
        });

        this.emit({ type: 'scene_created', data: { ideaId: approved.ideaId, success: result.success } });
      } catch (error: any) {
        this.state.sceneResults.push({
          ideaId: approved.ideaId,
          ideaTitle: approved.ideaTitle,
          originalPhotoUrl: approved.photoUrl,
          tier: 'unknown',
          costCents: 0,
          success: false,
          error: error.message,
        });
      }
    }
  }

  private setStatus(status: PipelineState['status']): void {
    this.state.status = status;
    this.emit({ type: 'status_change', data: { status } });
  }

  private emit(event: Omit<PipelineEvent, 'timestamp'>): void {
    const fullEvent: PipelineEvent = { ...event, timestamp: new Date().toISOString() };
    this.events.push(fullEvent);
    this.onEvent?.(fullEvent);
  }
}

// ─── Convenience Functions ───────────────────────────────────────────────────

/** Start a new pipeline run (called from API route) */
export async function startPipeline(config: PipelineConfig): Promise<PipelineState> {
  const pipeline = new ContentPipeline(config);
  return pipeline.start();
}

/** Quick auto-mode run: generate ideas, pick photos, recreate scenes — no user input needed */
export async function runAutoPipeline(
  userId: string,
  characterId: string,
  ideaCount = 5
): Promise<PipelineState> {
  const pipeline = new ContentPipeline({
    userId,
    characterId,
    autoMode: true,
    ideaCount,
  });
  return pipeline.start();
}
