import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import * as fsSync from 'fs';

const BLOTATO_KEY = process.env.BLOTATO_API_KEY || '';
const BASE_URL = 'https://backend.blotato.com/v2';
const INSTA_ACCOUNT_ID = '27011'; // islandsplashjuice

interface Post {
  post_id: string; ad_filenames: string[]; post_type: string;
  caption: string; hashtags: string; scheduled?: boolean;
  scheduledAt?: string; blotatoPostId?: string; scheduledTime?: string;
}

interface Batch { brand: string; created_at: string; posts: Post[]; }

function getImagePath(brand: string, filename: string): string {
  let base = filename.replace(/\.(instructions|instructions\.txt)$/, '');
  const websiteImages = `/home/drewp/asset-ads/website/public/images/ads/${brand}/${base}.png`;
  const outputDir = `/home/drewp/asset-ads/output/${base}.png`;
  try { fsSync.accessSync(websiteImages); return websiteImages; } catch {}
  try { fsSync.accessSync(outputDir); return outputDir; } catch {}
  return websiteImages;
}

async function uploadToBlotato(imagePath: string): Promise<string> {
  const filename = imagePath.split('/').pop() || 'image.png';
  const fileBuffer = fsSync.readFileSync(imagePath);

  const presignRes = await fetch(`${BASE_URL}/media/uploads`, {
    method: 'POST',
    headers: { 'blotato-api-key': BLOTATO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  if (!presignRes.ok) throw new Error(`Presign failed: ${await presignRes.text()}`);
  const { presignedUrl, publicUrl } = await presignRes.json();

  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: fileBuffer,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  return publicUrl ?? undefined;
}

// Pick a random future slot: AM = 9am, PM = 2pm, days out from now
function pickSlot(amOrPm: 'am' | 'pm'): string {
  const now = new Date();
  const dayOffset = amOrPm === 'am' ? 0 : 0;
  const hour = amOrPm === 'am' ? 9 : 14;
  const minute = 0;

  // Start from tomorrow, find next valid day (skip today if passed)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const scheduled = new Date(tomorrow);
  scheduled.setHours(hour, minute, 0, 0);

  // Format: 2026-04-27T14:00:00Z
  return scheduled.toISOString().replace('.000Z', 'Z');
}

async function schedulePostViaBlotato(
  caption: string,
  imageUrls: string[],
  mode: 'immediate' | 'am' | 'pm'
): Promise<string> {
  let payload: any = {
    post: {
      accountId: INSTA_ACCOUNT_ID,
      content: { text: caption, mediaUrls: imageUrls, platform: 'instagram' },
      target: { targetType: 'instagram' },
    },
  };

  if (mode === 'immediate') {
    // No scheduling fields = publish immediately
  } else {
    // Schedule at a specific future time
    payload.scheduledTime = pickSlot(mode);
  }

  const res = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: { 'blotato-api-key': BLOTATO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Schedule failed: ${err}`);
  }

  const data = await res.json();
  return data.postSubmissionId;
}

function findBatchFile(brand: string): string | null {
  const postsDir = '/home/drewp/asset-ads/output/posts';
  try {
    const files = fsSync.readdirSync(postsDir)
      .filter((f: string) => f.startsWith(`${brand}_`) && f.endsWith('.json'))
      .sort().reverse();
    return files[0] ? path.join(postsDir, files[0]) : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const { brand, post_id, mode } = await req.json();
    if (!brand || !post_id) {
      return NextResponse.json({ error: 'brand and post_id required' }, { status: 400 });
    }

    const scheduleMode = mode || 'am'; // 'am', 'pm', or 'immediate'

    const batchPath = findBatchFile(brand);
    if (!batchPath) return NextResponse.json({ error: 'No posts found' }, { status: 404 });

    const batch: Batch = JSON.parse(fsSync.readFileSync(batchPath, 'utf-8'));
    const post = batch.posts.find((p: Post) => p.post_id === post_id);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (post.scheduled) return NextResponse.json({ error: 'Already scheduled', blotatoPostId: post.blotatoPostId }, { status: 409 });

    // Upload images
    const imageUrls: string[] = [];
    const errors: string[] = [];
    for (const filename of post.ad_filenames) {
      try {
        const imagePath = getImagePath(brand, filename);
        const url = await uploadToBlotato(imagePath);
        imageUrls.push(url);
      } catch (e: any) {
        errors.push(`${filename}: ${e.message}`);
      }
    }

    if (errors.length > 0 && imageUrls.length === 0) {
      return NextResponse.json({ error: 'All uploads failed', details: errors }, { status: 500 });
    }

    // Build caption
    let fullCaption = post.caption;
    if (post.hashtags && !fullCaption.includes(post.hashtags)) {
      fullCaption += '\n\n' + post.hashtags;
    }

    // Submit to Blotato
    const blotatoPostId = await schedulePostViaBlotato(fullCaption, imageUrls, scheduleMode);

    // Update batch file
    post.scheduled = true;
    post.scheduledAt = new Date().toISOString();
    post.scheduledTime = scheduleMode !== 'immediate' ? pickSlot(scheduleMode) : undefined;
    post.blotatoPostId = blotatoPostId;
    fsSync.writeFileSync(batchPath, JSON.stringify(batch, null, 2));

    return NextResponse.json({
      success: true,
      blotatoPostId,
      imageCount: imageUrls.length,
      errors: errors.length > 0 ? errors : undefined,
      scheduledAt: post.scheduledAt,
      scheduledTime: post.scheduledTime,
      mode: scheduleMode,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BASE_URL}/schedules?limit=20`, {
      headers: { 'blotato-api-key': BLOTATO_KEY },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
