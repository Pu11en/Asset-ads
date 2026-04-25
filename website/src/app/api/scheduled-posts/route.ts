import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readFile } from '@/lib/fs';

const BLOTATO_KEY = process.env.BLOTATO_API_KEY || '';
const BASE_URL = 'https://backend.blotato.com/v2';

// Get all posts from all batch files for a brand
function getAllBatchFiles(brand: string): { path: string; data: any }[] {
  const postsDir = '/home/drewp/asset-ads/output/posts';
  try {
    const files = require('fs').readdirSync(postsDir)
      .filter((f: string) => f.startsWith(`${brand}_`) && f.endsWith('.json'))
      .sort()
      .reverse();
    return files.map((f: string) => ({
      path: path.join(postsDir, f),
      data: JSON.parse(require('fs').readFileSync(path.join(postsDir, f), 'utf-8')),
    }));
  } catch {
    return [];
  }
}

// Fetch status from Blotato for a single post
async function getPostStatus(blotatoPostId: string): Promise<{ status: string; publicUrl?: string; errorMessage?: string } | null> {
  if (!blotatoPostId) return null;
  try {
    const res = await fetch(`${BASE_URL}/posts/${blotatoPostId}`, {
      headers: { 'blotato-api-key': BLOTATO_KEY },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetch all scheduled posts from Blotato
async function getBlotatoSchedules() {
  try {
    const res = await fetch(`${BASE_URL}/schedules?limit=50`, {
      headers: { 'blotato-api-key': BLOTATO_KEY },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand') || 'island-splash';

  // Get all batches
  const batches = getAllBatchFiles(brand);

  // Collect all scheduled posts with their batch file
  const scheduledPosts: any[] = [];
  for (const { path: batchPath, data } of batches) {
    for (const post of data.posts || []) {
      if (post.scheduled || post.blotatoPostId) {
        scheduledPosts.push({
          ...post,
          _batchFile: batchPath.split('/').pop(),
          _brand: brand,
        });
      }
    }
  }

  // Enrich with Blotato status
  const enriched = await Promise.all(scheduledPosts.map(async (post) => {
    const blotatoStatus = await getPostStatus(post.blotatoPostId);
    return {
      post_id: post.post_id,
      caption: post.caption,
      hashtags: post.hashtags,
      ad_filenames: post.ad_filenames,
      blotatoPostId: post.blotatoPostId,
      scheduledAt: post.scheduledAt,
      blotatoStatus: blotatoStatus?.status || 'unknown',
      publicUrl: blotatoStatus?.publicUrl || null,
      errorMessage: blotatoStatus?.errorMessage || null,
      _batchFile: post._batchFile,
    };
  }));

  // Also get Blotato schedules
  const blotatoSchedules = await getBlotatoSchedules();

  return NextResponse.json({
    posts: enriched,
    blotatoSchedules,
  });
}
