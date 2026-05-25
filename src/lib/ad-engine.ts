import { db } from './db';
import { chargeAmount } from './credit-system';
import {
  createCampaign,
  createAdSet,
  createAd,
  createImageAdCreative,
  createVideoAdCreative,
  createCarouselAdCreative,
  createStoryAdCreative,
  uploadImage,
  uploadVideo,
  updateCampaignStatus,
  updateAdStatus,
  getAdInsights,
  getCampaignInsights,
  TargetingSpec,
  BudgetSpec,
  ScheduleSpec,
} from './meta-ads';

// Types

export interface AdContentInput {
  format: 'image' | 'video' | 'carousel' | 'story';
  message: string;
  headline: string;
  description?: string;
  linkUrl: string;
  callToAction?: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  cards?: {
    imageUrl?: string;
    videoUrl?: string;
    headline: string;
    description?: string;
    linkUrl: string;
    callToAction?: string;
  }[];
}

export interface CreateAdInput {
  userId: string;
  facebookAccountId: string;
  name: string;
  objective: string;
  content: AdContentInput;
  targeting: TargetingSpec;
  budget: BudgetSpec;
  schedule: ScheduleSpec;
}

// Ad Creation Orchestrator

export async function createAdFromContent(input: CreateAdInput) {
  const {
    userId,
    facebookAccountId,
    name,
    objective,
    content,
    targeting,
    budget,
    schedule,
  } = input;

  // 1. Get the Facebook account details
  const fbAccount = await db.facebookAccount.findFirst({
    where: { id: facebookAccountId, userId, status: 'active' },
  });

  if (!fbAccount) {
    throw new Error('Facebook account not found or not connected.');
  }

  if (!fbAccount.adAccountId) {
    throw new Error('No ad account linked. Please reconnect your Facebook account.');
  }

  if (!fbAccount.fbPageId) {
    throw new Error('No Facebook Page linked. You need a Page to run ads.');
  }

  // 2. Charge the user wallet
  const AD_PUBLISH_FEE_CENTS = 100;
  const charged = await chargeAmount(userId, AD_PUBLISH_FEE_CENTS, 'Ad publish fee');
  if (!charged) {
    throw new Error('Insufficient balance. You need $1.00 to publish an ad.');
  }

  // 3. Create ad campaign record in DB (draft)
  const adCampaign = await db.adCampaign.create({
    data: {
      userId,
      facebookAccountId,
      name,
      objective,
      status: 'draft',
      adFormat: content.format,
      content: content as any,
      targeting: targeting as any,
      budget: budget as any,
      schedule: schedule as any,
      chargeAmountCents: AD_PUBLISH_FEE_CENTS,
    },
  });

  try {
    // 4. Create campaign on Meta
    const campaign = await createCampaign(
      facebookAccountId,
      fbAccount.adAccountId,
      name,
      objective
    );

    await db.adCampaign.update({
      where: { id: adCampaign.id },
      data: { metaCampaignId: campaign.id, status: 'pending' },
    });

    // 5. Create ad set
    const adSet = await createAdSet(
      facebookAccountId,
      fbAccount.adAccountId,
      campaign.id,
      name + ' - Ad Set',
      targeting,
      budget,
      schedule
    );

    await db.adCampaign.update({
      where: { id: adCampaign.id },
      data: { metaAdSetId: adSet.id },
    });

    // 6. Create ad creative based on format
    let creativeId: string;

    switch (content.format) {
      case 'image': {
        if (!content.imageUrl) throw new Error('Image URL is required for image ads.');
        const image = await uploadImage(facebookAccountId, fbAccount.adAccountId, content.imageUrl);
        const creative = await createImageAdCreative(facebookAccountId, fbAccount.adAccountId, {
          name: name + ' - Creative',
          imageHash: image.hash,
          message: content.message,
          headline: content.headline,
          description: content.description,
          linkUrl: content.linkUrl,
          callToAction: content.callToAction,
          pageId: fbAccount.fbPageId,
          instagramAccountId: fbAccount.igAccountId || undefined,
        });
        creativeId = creative.id;
        break;
      }

      case 'video': {
        if (!content.videoUrl) throw new Error('Video URL is required for video ads.');
        const video = await uploadVideo(facebookAccountId, fbAccount.adAccountId, content.videoUrl);
        const creative = await createVideoAdCreative(facebookAccountId, fbAccount.adAccountId, {
          name: name + ' - Creative',
          videoId: video.id,
          thumbnailUrl: content.thumbnailUrl,
          message: content.message,
          headline: content.headline,
          description: content.description,
          linkUrl: content.linkUrl,
          callToAction: content.callToAction,
          pageId: fbAccount.fbPageId,
          instagramAccountId: fbAccount.igAccountId || undefined,
        });
        creativeId = creative.id;
        break;
      }

      case 'carousel': {
        if (!content.cards || content.cards.length < 2) {
          throw new Error('Carousel ads need at least 2 cards.');
        }
        const processedCards = await Promise.all(
          content.cards.map(async (card) => {
            let imageHash: string | undefined;
            let videoId: string | undefined;
            if (card.imageUrl) {
              const img = await uploadImage(facebookAccountId, fbAccount.adAccountId!, card.imageUrl);
              imageHash = img.hash;
            }
            if (card.videoUrl) {
              const vid = await uploadVideo(facebookAccountId, fbAccount.adAccountId!, card.videoUrl);
              videoId = vid.id;
            }
            return { imageHash, videoId, headline: card.headline, description: card.description, linkUrl: card.linkUrl, callToAction: card.callToAction };
          })
        );
        const creative = await createCarouselAdCreative(facebookAccountId, fbAccount.adAccountId, {
          name: name + ' - Creative',
          cards: processedCards,
          message: content.message,
          linkUrl: content.linkUrl,
          pageId: fbAccount.fbPageId,
          instagramAccountId: fbAccount.igAccountId || undefined,
        });
        creativeId = creative.id;
        break;
      }

      case 'story': {
        let imageHash: string | undefined;
        let videoId: string | undefined;
        if (content.imageUrl) {
          const img = await uploadImage(facebookAccountId, fbAccount.adAccountId, content.imageUrl);
          imageHash = img.hash;
        }
        if (content.videoUrl) {
          const vid = await uploadVideo(facebookAccountId, fbAccount.adAccountId, content.videoUrl);
          videoId = vid.id;
        }
        const creative = await createStoryAdCreative(facebookAccountId, fbAccount.adAccountId, {
          name: name + ' - Creative',
          imageHash,
          videoId,
          linkUrl: content.linkUrl,
          callToAction: content.callToAction,
          pageId: fbAccount.fbPageId,
          instagramAccountId: fbAccount.igAccountId || undefined,
        });
        creativeId = creative.id;
        break;
      }

      default:
        throw new Error('Unsupported ad format: ' + content.format);
    }

    await db.adCampaign.update({
      where: { id: adCampaign.id },
      data: { metaAdCreativeId: creativeId },
    });

    // 7. Create the actual ad
    const ad = await createAd(facebookAccountId, fbAccount.adAccountId, adSet.id, creativeId, name + ' - Ad');

    await db.adCampaign.update({
      where: { id: adCampaign.id },
      data: { metaAdId: ad.id, status: 'pending' },
    });

    return {
      success: true,
      adCampaignId: adCampaign.id,
      metaCampaignId: campaign.id,
      metaAdSetId: adSet.id,
      metaAdCreativeId: creativeId,
      metaAdId: ad.id,
    };
  } catch (error: any) {
    await db.adCampaign.update({
      where: { id: adCampaign.id },
      data: { status: 'failed', errorMessage: error.message || 'Unknown error' },
    });
    throw error;
  }
}

// Activate / Pause

export async function activateAd(adCampaignId: string, userId: string) {
  const campaign = await db.adCampaign.findFirst({
    where: { id: adCampaignId, userId },
  });

  if (!campaign) throw new Error('Ad campaign not found.');
  if (!campaign.metaCampaignId || !campaign.metaAdId) {
    throw new Error('Ad has not been fully created on Meta yet.');
  }

  await updateCampaignStatus(campaign.facebookAccountId, campaign.metaCampaignId, 'ACTIVE');
  await updateAdStatus(campaign.facebookAccountId, campaign.metaAdId, 'ACTIVE');

  await db.adCampaign.update({
    where: { id: adCampaignId },
    data: { status: 'active' },
  });

  return { success: true };
}

export async function pauseAd(adCampaignId: string, userId: string) {
  const campaign = await db.adCampaign.findFirst({
    where: { id: adCampaignId, userId },
  });

  if (!campaign) throw new Error('Ad campaign not found.');
  if (!campaign.metaCampaignId) {
    throw new Error('Ad has not been created on Meta yet.');
  }

  await updateCampaignStatus(campaign.facebookAccountId, campaign.metaCampaignId, 'PAUSED');

  await db.adCampaign.update({
    where: { id: adCampaignId },
    data: { status: 'paused' },
  });

  return { success: true };
}

// Performance

export async function getAdPerformance(adCampaignId: string, userId: string) {
  const campaign = await db.adCampaign.findFirst({
    where: { id: adCampaignId, userId },
  });

  if (!campaign) throw new Error('Ad campaign not found.');
  if (!campaign.metaAdId) throw new Error('No Meta ad ID found.');

  const insights = await getAdInsights(campaign.facebookAccountId, campaign.metaAdId);

  if (insights) {
    await db.adCampaign.update({
      where: { id: adCampaignId },
      data: { metrics: insights as any, metricsUpdatedAt: new Date() },
    });
  }

  return insights;
}

// List / Get

export async function listUserAds(
  userId: string,
  status?: string,
  page: number = 1,
  pageSize: number = 20
) {
  const where: any = { userId };
  if (status) where.status = status;

  const [ads, total] = await Promise.all([
    db.adCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        facebookAccount: {
          select: { fbPageName: true, igAccountId: true },
        },
      },
    }),
    db.adCampaign.count({ where }),
  ]);

  return {
    ads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAdById(adCampaignId: string, userId: string) {
  return db.adCampaign.findFirst({
    where: { id: adCampaignId, userId },
    include: {
      facebookAccount: {
        select: { fbPageName: true, igAccountId: true, adAccountId: true },
      },
    },
  });
}

// Delete (soft)

export async function deleteAd(adCampaignId: string, userId: string) {
  const campaign = await db.adCampaign.findFirst({
    where: { id: adCampaignId, userId },
  });

  if (!campaign) throw new Error('Ad campaign not found.');

  if (campaign.metaCampaignId) {
    try {
      await updateCampaignStatus(campaign.facebookAccountId, campaign.metaCampaignId, 'DELETED');
    } catch (e) {
      console.error('Failed to delete on Meta:', e);
    }
  }

  await db.adCampaign.update({
    where: { id: adCampaignId },
    data: { status: 'failed', errorMessage: 'Deleted by user' },
  });

  return { success: true };
}


// Bulk Metrics Refresh

export async function refreshAllUserAdMetrics(userId: string) {
  const activeAds = await db.adCampaign.findMany({
    where: {
      userId,
      status: { in: ['active', 'pending', 'paused'] },
      metaAdId: { not: null },
    },
  });

  const results = [];
  for (const ad of activeAds) {
    try {
      const insights = await getAdInsights(ad.facebookAccountId, ad.metaAdId!);
      if (insights) {
        await db.adCampaign.update({
          where: { id: ad.id },
          data: { metrics: insights as any, metricsUpdatedAt: new Date() },
        });
        results.push({ id: ad.id, status: 'updated' });
      } else {
        results.push({ id: ad.id, status: 'no_data' });
      }
    } catch (error: any) {
      results.push({ id: ad.id, status: 'error', error: error.message });
    }
  }

  return results;
}

export async function refreshAllAdMetricsCron() {
  const usersWithAds = await db.adCampaign.findMany({
    where: {
      status: { in: ['active', 'pending'] },
      metaAdId: { not: null },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  const results = [];
  for (const { userId } of usersWithAds) {
    const userResults = await refreshAllUserAdMetrics(userId);
    results.push({ userId, ads: userResults });
  }

  return results;
}
