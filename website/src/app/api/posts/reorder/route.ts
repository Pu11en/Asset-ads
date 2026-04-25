import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface Post {
  post_id: string; ad_filenames: string[]; post_type: string;
  caption: string; hashtags: string; scheduled?: boolean;
  scheduledAt?: string; blotatoPostId?: string; scheduledTime?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { brand, filename, posts } = await req.json();
    if (!brand || !filename || !posts) {
      return NextResponse.json({ error: 'Missing brand, filename, or posts' }, { status: 400 });
    }

    const batchDir = '/home/drewp/asset-ads/output/posts';
    const filePath = path.join(batchDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Batch file not found' }, { status: 404 });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Replace posts array with the reordered one, preserving all post fields
    const existingPosts = data.posts;
    data.posts = posts.map((updated: Post) => {
      const existing = existingPosts.find((p: Post) => p.post_id === updated.post_id);
      return existing ? { ...existing, ...updated } : updated;
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
