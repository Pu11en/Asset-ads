import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export async function POST(req: NextRequest) {
  try {
    const { brand, filename, post_id, imageFilename } = await req.json();

    if (!brand || !filename || !post_id || !imageFilename) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const batchPath = resolve('/home/drewp/asset-ads/output/posts', filename);
    const batch = JSON.parse(readFileSync(batchPath, 'utf-8'));

    const post = batch.posts.find((p: any) => p.post_id === post_id);
    if (!post) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    const idx = post.ad_filenames.indexOf(imageFilename);
    if (idx === -1) {
      return NextResponse.json({ success: false, error: 'Image not found in post' }, { status: 404 });
    }

    post.ad_filenames.splice(idx, 1);
    writeFileSync(batchPath, JSON.stringify(batch, null, 2));

    return NextResponse.json({ success: true, remainingImages: post.ad_filenames.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
