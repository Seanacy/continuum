import { db } from './db';
import { getDecryptedToken, refreshTokenIfNeeded } from './meta-auth';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Types

export interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface CampaignObjective {
  value: string;
  label: string;
}

export const CAMPAIGN_OBJECTIVES: CampaignObjective[] = [
  { value: 'OUTCOME_AWARENESS', label: 'Brand Awareness' },
  { value: 'OUTCOME_TRAFFIC', label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: 'OUTCOME_LEADS', label: 'Leads' },
  { value: 'OUTCOME_SALES', label: 'Sales' },
];

export interface TargetingSpec {
  geo_locations?: {
    countries?: string[];
    cities?: { key: string; name?: string }[];
    regions?: { key: string; name?: string }[];
    zips?: { key: string }[];
  };
  age_min?: number;
  age_max?: number;
  genders?: number[];
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  custom_audiences?: { id: string }[];
  excluded_custom_audiences?: { id: string }[];
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
}

export interface BudgetSpec {
  type: 'daily' | 'lifetime';
  amount: number;
}

export interface ScheduleSpec {
  startTime: string;
  endTime?: string;
}

// Helpers

async function metaFetch(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<any> {
  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}access_token=${accessToken}`;

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      ...options.headers,
    },
  });

  const data = await res.json();

  if (data.error) {
    const err = data as MetaApiError;
    throw new Error(
      `Meta API Error [${err.error.code}]: ${err.error.message}`
    );
  }

  return data;
}

async function metaPost(
  url: string,
  accessToken: string,
  body: Record<string, any>
): Promise<any> {
  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      formData.append(
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      );
    }
  }

  return metaFetch(url, accessToken, {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}

// Get valid token for a Facebook account

async function getToken(facebookAccountId: string): Promise<string> {
  await refreshTokenIfNeeded(facebookAccountId);
  const token = await getDecryptedToken(facebookAccountId);
  if (!token) {
    throw new Error('No valid token found. Please reconnect your Facebook account.');
  }
  return token.accessToken;
}

// Campaign Management

export async function createCampaign(
  facebookAccountId: string,
  adAccountId: string,
  name: string,
  objective: string
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/campaigns`,
    token,
    {
      name,
      objective,
      status: 'PAUSED',
      special_ad_categories: '[]',
    }
  );

  return { id: result.id };
}

export async function updateCampaignStatus(
  facebookAccountId: string,
  campaignId: string,
  status: 'ACTIVE' | 'PAUSED' | 'DELETED'
): Promise<boolean> {
  const token = await getToken(facebookAccountId);

  const result = await metaPost(
    `${GRAPH_API_BASE}/${campaignId}`,
    token,
    { status }
  );

  return result.success;
}

// Ad Set Management

export async function createAdSet(
  facebookAccountId: string,
  adAccountId: string,
  campaignId: string,
  name: string,
  targeting: TargetingSpec,
  budget: BudgetSpec,
  schedule: ScheduleSpec,
  optimizationGoal: string = 'LINK_CLICKS'
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const body: Record<string, any> = {
    name,
    campaign_id: campaignId,
    targeting,
    optimization_goal: optimizationGoal,
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    status: 'PAUSED',
    start_time: schedule.startTime,
  };

  if (budget.type === 'daily') {
    body.daily_budget = budget.amount;
  } else {
    body.lifetime_budget = budget.amount;
  }

  if (schedule.endTime) {
    body.end_time = schedule.endTime;
  }

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/adsets`,
    token,
    body
  );

  return { id: result.id };
}

// Ad Creative - Upload

export async function uploadImage(
  facebookAccountId: string,
  adAccountId: string,
  imageUrl: string
): Promise<{ hash: string; url: string }> {
  const token = await getToken(facebookAccountId);

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/adimages`,
    token,
    { url: imageUrl }
  );

  const images = result.images;
  const key = Object.keys(images)[0];
  return {
    hash: images[key].hash,
    url: images[key].url,
  };
}

export async function uploadVideo(
  facebookAccountId: string,
  adAccountId: string,
  videoUrl: string
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/advideos`,
    token,
    { file_url: videoUrl }
  );

  return { id: result.id };
}

// Image Ad Creative

export async function createImageAdCreative(
  facebookAccountId: string,
  adAccountId: string,
  params: {
    name: string;
    imageHash: string;
    message: string;
    headline: string;
    description?: string;
    linkUrl: string;
    callToAction?: string;
    pageId: string;
    instagramAccountId?: string;
  }
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
    link_data: {
      image_hash: params.imageHash,
      message: params.message,
      name: params.headline,
      description: params.description || '',
      link: params.linkUrl,
      call_to_action: {
        type: params.callToAction || 'LEARN_MORE',
        value: { link: params.linkUrl },
      },
    },
  };

  if (params.instagramAccountId) {
    objectStorySpec.instagram_actor_id = params.instagramAccountId;
  }

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/adcreatives`,
    token,
    {
      name: params.name,
      object_story_spec: objectStorySpec,
    }
  );

  return { id: result.id };
}

// Video Ad Creative

export async function createVideoAdCreative(
  facebookAccountId: string,
  adAccountId: string,
  params: {
    name: string;
    videoId: string;
    thumbnailUrl?: string;
    message: string;
    headline: string;
    description?: string;
    linkUrl: string;
    callToAction?: string;
    pageId: string;
    instagramAccountId?: string;
  }
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const videoData: Record<string, any> = {
    video_id: params.videoId,
    message: params.message,
    name: params.headline,
    description: params.description || '',
    link: params.linkUrl,
    call_to_action: {
      type: params.callToAction || 'LEARN_MORE',
      value: { link: params.linkUrl },
    },
  };

  if (params.thumbnailUrl) {
    videoData.image_url = params.thumbnailUrl;
  }

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
    video_data: videoData,
  };

  if (params.instagramAccountId) {
    objectStorySpec.instagram_actor_id = params.instagramAccountId;
  }

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/adcreatives`,
    token,
    {
      name: params.name,
      object_story_spec: objectStorySpec,
    }
  );

  return { id: result.id };
}

// Carousel Ad Creative

export async function createCarouselAdCreative(
  facebookAccountId: string,
  adAccountId: string,
  params: {
    name: string;
    cards: {
      imageHash?: string;
      videoId?: string;
      headline: string;
      description?: string;
      linkUrl: string;
      callToAction?: string;
    }[];
    message: string;
    linkUrl: string;
    pageId: string;
    instagramAccountId?: string;
  }
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const childAttachments = params.cards.map((card) => {
    const attachment: Record<string, any> = {
      name: card.headline,
      description: card.description || '',
      link: card.linkUrl,
      call_to_action: {
        type: card.callToAction || 'LEARN_MORE',
        value: { link: card.linkUrl },
      },
    };

    if (card.imageHash) {
      attachment.image_hash = card.imageHash;
    }
    if (card.videoId) {
      attachment.video_id = card.videoId;
    }

    return attachment;
  });

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
    link_data: {
      message: params.message,
      link: params.linkUrl,
      child_attachments: childAttachments,
      multi_share_optimized: true,
    },
  };

  if (params.instagramAccountId) {
    objectStorySpec.instagram_actor_id = params.instagramAccountId;
  }

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/adcreatives`,
    token,
    {
      name: params.name,
      object_story_spec: objectStorySpec,
    }
  );

  return { id: result.id };
}

// Story Ad Creative

export async function createStoryAdCreative(
  facebookAccountId: string,
  adAccountId: string,
  params: {
    name: string;
    imageHash?: string;
    videoId?: string;
    linkUrl: string;
    callToAction?: string;
    pageId: string;
    instagramAccountId?: string;
  }
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const assetFeedSpec: Record<string, any> = {
    bodies: [{ text: '' }],
    titles: [{ text: '' }],
    link_urls: [{ website_url: params.linkUrl }],
    call_to_action_types: [params.callToAction || 'LEARN_MORE'],
    ad_formats: ['SINGLE_IMAGE'],
  };

  if (params.imageHash) {
    assetFeedSpec.images = [{ hash: params.imageHash }];
  }
  if (params.videoId) {
    assetFeedSpec.videos = [{ video_id: params.videoId }];
    assetFeedSpec.ad_formats = ['SINGLE_VIDEO'];
  }

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
  };

  if (params.instagramAccountId) {
    objectStorySpec.instagram_actor_id = params.instagramAccountId;
  }

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/adcreatives`,
    token,
    {
      name: params.name,
      object_story_spec: objectStorySpec,
      asset_feed_spec: assetFeedSpec,
    }
  );

  return { id: result.id };
}

// Ad Management

export async function createAd(
  facebookAccountId: string,
  adAccountId: string,
  adSetId: string,
  creativeId: string,
  name: string
): Promise<{ id: string }> {
  const token = await getToken(facebookAccountId);

  const result = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/ads`,
    token,
    {
      name,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    }
  );

  return { id: result.id };
}

export async function updateAdStatus(
  facebookAccountId: string,
  adId: string,
  status: 'ACTIVE' | 'PAUSED' | 'DELETED'
): Promise<boolean> {
  const token = await getToken(facebookAccountId);

  const result = await metaPost(
    `${GRAPH_API_BASE}/${adId}`,
    token,
    { status }
  );

  return result.success;
}

// Insights & Metrics

export async function getAdInsights(
  facebookAccountId: string,
  adId: string,
  datePreset: string = 'last_7d'
): Promise<any> {
  const token = await getToken(facebookAccountId);

  const fields = [
    'impressions',
    'reach',
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'spend',
    'actions',
    'cost_per_action_type',
    'frequency',
  ].join(',');

  const data = await metaFetch(
    `${GRAPH_API_BASE}/${adId}/insights?fields=${fields}&date_preset=${datePreset}`,
    token
  );

  return data.data?.[0] || null;
}

export async function getCampaignInsights(
  facebookAccountId: string,
  campaignId: string,
  datePreset: string = 'last_7d'
): Promise<any> {
  const token = await getToken(facebookAccountId);

  const fields = [
    'impressions',
    'reach',
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'spend',
    'actions',
    'frequency',
  ].join(',');

  const data = await metaFetch(
    `${GRAPH_API_BASE}/${campaignId}/insights?fields=${fields}&date_preset=${datePreset}`,
    token
  );

  return data.data?.[0] || null;
}

// Targeting Search

export async function searchInterests(
  facebookAccountId: string,
  query: string,
  limit: number = 25
): Promise<{ id: string; name: string; audience_size: number; path: string[] }[]> {
  const token = await getToken(facebookAccountId);

  const data = await metaFetch(
    `${GRAPH_API_BASE}/search?type=adinterest&q=${encodeURIComponent(query)}&limit=${limit}`,
    token
  );

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    audience_size: item.audience_size_lower_bound || 0,
    path: item.path || [],
  }));
}

export async function searchLocations(
  facebookAccountId: string,
  query: string,
  type: string = 'adgeolocation',
  limit: number = 25
): Promise<{ key: string; name: string; type: string; country_code?: string }[]> {
  const token = await getToken(facebookAccountId);

  const data = await metaFetch(
    `${GRAPH_API_BASE}/search?type=${type}&q=${encodeURIComponent(query)}&limit=${limit}`,
    token
  );

  return (data.data || []).map((item: any) => ({
    key: item.key,
    name: item.name,
    type: item.type,
    country_code: item.country_code,
  }));
}

// Ad Preview

export async function getAdPreview(
  facebookAccountId: string,
  creativeId: string,
  adFormat: string = 'DESKTOP_FEED_STANDARD'
): Promise<string> {
  const token = await getToken(facebookAccountId);

  const data = await metaFetch(
    `${GRAPH_API_BASE}/${creativeId}/previews?ad_format=${adFormat}`,
    token
  );

  return data.data?.[0]?.body || '';
}

// Audience Estimate

export async function getReachEstimate(
  facebookAccountId: string,
  adAccountId: string,
  targeting: TargetingSpec,
  optimizationGoal: string = 'LINK_CLICKS'
): Promise<{ users_lower_bound: number; users_upper_bound: number }> {
  const token = await getToken(facebookAccountId);

  const data = await metaPost(
    `${GRAPH_API_BASE}/act_${adAccountId}/reachestimate`,
    token,
    {
      targeting_spec: targeting,
      optimization_goal: optimizationGoal,
    }
  );

  return {
    users_lower_bound: data.data?.users_lower_bound || 0,
    users_upper_bound: data.data?.users_upper_bound || 0,
  };
}


// Time Series Insights (daily breakdown for charts)

export async function getAdInsightsTimeSeries(
  facebookAccountId: string,
  adId: string,
  datePreset: string = 'last_7d'
): Promise<any[]> {
  const token = await getToken(facebookAccountId);

  const fields = [
    'impressions',
    'reach',
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'spend',
    'actions',
    'date_start',
    'date_stop',
  ].join(',');

  const data = await metaFetch(
    `${GRAPH_API_BASE}/${adId}/insights?fields=${fields}&date_preset=${datePreset}&time_increment=1`,
    token
  );

  return data.data || [];
}
