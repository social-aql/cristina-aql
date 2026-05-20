import { faker } from '@faker-js/faker';
import type {
  NormalizedAccount,
  NormalizedAccountMetrics,
  NormalizedPost,
  NormalizedPostMetrics,
  MediaType,
} from '@/lib/normalized-types';

faker.seed(42);

const ACCOUNT_ID = 'mock-account-001';
const DISPLAY_NAME = faker.person.fullName();
const HANDLE = faker.internet.username().toLowerCase();
const FOLLOWER_COUNT = faker.number.int({ min: 8000, max: 45000 });

export function getMockAccount(): NormalizedAccount {
  return {
    externalId: ACCOUNT_ID,
    providerId: 'mock',
    platform: 'mock',
    displayName: DISPLAY_NAME,
    handle: `@${HANDLE}`,
    avatarUrl: null,
    followerCount: FOLLOWER_COUNT,
    followingCount: faker.number.int({ min: 200, max: 1200 }),
    postCount: 30,
  };
}

export function getMockAccountMetrics(): NormalizedAccountMetrics {
  return {
    accountExternalId: ACCOUNT_ID,
    capturedAt: new Date().toISOString(),
    followers: FOLLOWER_COUNT,
    reach: faker.number.int({ min: 15000, max: 80000 }),
    impressions: faker.number.int({ min: 40000, max: 200000 }),
    profileViews: faker.number.int({ min: 500, max: 3000 }),
    websiteClicks: faker.number.int({ min: 50, max: 400 }),
  };
}

// Engagement multipliers by media type (Reels > carousel > image)
const engagementBase: Record<MediaType, { impressionsMin: number; impressionsMax: number; engagementMin: number; engagementMax: number }> = {
  reel: { impressionsMin: 8000, impressionsMax: 50000, engagementMin: 4, engagementMax: 12 },
  carousel: { impressionsMin: 4000, impressionsMax: 20000, engagementMin: 3, engagementMax: 8 },
  image: { impressionsMin: 2000, impressionsMax: 12000, engagementMin: 1.5, engagementMax: 5 },
  video: { impressionsMin: 5000, impressionsMax: 30000, engagementMin: 3, engagementMax: 9 },
  story: { impressionsMin: 1000, impressionsMax: 8000, engagementMin: 1, engagementMax: 4 },
  text: { impressionsMin: 500, impressionsMax: 5000, engagementMin: 0.5, engagementMax: 3 },
};

const MEDIA_TYPES: MediaType[] = ['reel', 'carousel', 'image', 'reel', 'carousel', 'image', 'video', 'story'];

function randomHashtags(): string[] {
  const tags = ['#contentcreator', '#socialmedia', '#analytics', '#growth', '#reels', '#trending', '#viral', '#creator', '#digital', '#marketing'];
  const count = faker.number.int({ min: 2, max: 6 });
  return faker.helpers.arrayElements(tags, count);
}

let postCounter = 0;

function generatePost(daysAgo: number): { post: NormalizedPost; metrics: NormalizedPostMetrics } {
  postCounter++;
  const postId = `mock-post-${String(postCounter).padStart(3, '0')}`;
  const mediaType = MEDIA_TYPES[postCounter % MEDIA_TYPES.length];
  const base = engagementBase[mediaType];
  const publishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const impressions = faker.number.int({ min: base.impressionsMin, max: base.impressionsMax });
  const reach = Math.round(impressions * faker.number.float({ min: 0.6, max: 0.9 }));
  const engagementRate = faker.number.float({ min: base.engagementMin, max: base.engagementMax, fractionDigits: 2 });
  const likes = Math.round((engagementRate / 100) * reach * faker.number.float({ min: 0.7, max: 0.9 }));
  const comments = Math.round(likes * faker.number.float({ min: 0.02, max: 0.08 }));
  const shares = Math.round(likes * faker.number.float({ min: 0.01, max: 0.05 }));
  const saves = Math.round(likes * faker.number.float({ min: 0.05, max: 0.15 }));

  const post: NormalizedPost = {
    externalId: postId,
    accountExternalId: ACCOUNT_ID,
    publishedAt,
    mediaType,
    caption: faker.lorem.sentence({ min: 8, max: 20 }),
    mediaUrl: null,
    thumbnailUrl: null,
    permalink: `https://mock.provider/p/${postId}`,
    hashtags: randomHashtags(),
    mentions: [],
  };

  const metrics: NormalizedPostMetrics = {
    postExternalId: postId,
    capturedAt: new Date().toISOString(),
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    videoViews: mediaType === 'reel' || mediaType === 'video' ? Math.round(impressions * 0.8) : null,
    watchTimeSeconds: mediaType === 'reel' || mediaType === 'video' ? faker.number.int({ min: 5, max: 45 }) : null,
    engagementRate,
  };

  return { post, metrics };
}

// Pre-generate all 30 posts deterministically (seeded)
const GENERATED_POSTS: Array<{ post: NormalizedPost; metrics: NormalizedPostMetrics }> = [];
for (let i = 0; i < 30; i++) {
  const daysAgo = faker.number.int({ min: 1, max: 88 });
  GENERATED_POSTS.push(generatePost(daysAgo));
}

export function getMockPosts(): NormalizedPost[] {
  return GENERATED_POSTS.map((p) => p.post);
}

export function getMockPostMetrics(): Map<string, NormalizedPostMetrics> {
  const map = new Map<string, NormalizedPostMetrics>();
  for (const { post, metrics } of GENERATED_POSTS) {
    map.set(post.externalId, metrics);
  }
  return map;
}
