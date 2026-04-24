import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFile } from 'fs/promises';
import path from 'path';
import { getBlotatoSchedules, deleteSchedule, type BlotatoSchedule } from '@/lib/blotato';
import { loadScheduled, saveScheduled, type ScheduledPost } from '@/lib/scheduled';

export const dynamic = 'force-dynamic';

async function checkAuth(brand: string): Promise<boolean> {
  const jar = await cookies();
  const auth = jar.get('auth')?.value;
  const isAdmin = jar.get('admin')?.value === 'true';
  return isAdmin || auth === brand;
}

async function loadBrandConfig(brand: string): Promise<{ instagram_account_id?: string } | null> {
  try {
    const filePath = path.join(process.cwd(), '..', 'brands', `${brand}.json`);
    const raw = await readFile(filePath, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg.scheduling ?? null;
  } catch {
    return null;
  }
}

function parseCaptionParts(text: string): Pick<ScheduledPost, 'caption' | 'hashtags'> {
  const parts = text.split('\n\n');
  return {
    caption: parts[0] ?? text,
    hashtags: parts.slice(1).join('\n'),
  };
}

function inferSlot(iso: string): ScheduledPost['slot'] {
  return new Date(iso).getHours() < 12 ? '9am' : '5pm';
}

function toLocalRecord(item: BlotatoSchedule): ScheduledPost {
  const { caption, hashtags } = parseCaptionParts(item.draft.content.text);
  return {
    id: `blotato_${item.id}`,
    blotato_id: String(item.id),
    ad_ids: item.draft.content.mediaUrls.map((url: string) => url.split('/').pop() ?? url),
    caption,
    hashtags,
    scheduled_at: item.scheduledAt,
    slot: inferSlot(item.scheduledAt),
    platform: 'instagram',
    status: 'pending',
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  if (!await checkAuth(brand)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const localPosts = await loadScheduled(brand);
  const brandCfg = await loadBrandConfig(brand);
  const accountId = brandCfg?.instagram_account_id;
  const localByBlotatoId = new Map(localPosts.map(post => [String(post.blotato_id), post] as const));
  const posts = [...localPosts];

  if (!accountId) {
    return NextResponse.json({ posts });
  }

  try {
    const allItems = await getBlotatoSchedules();
    const brandItems = allItems.filter(item => item.account?.id === accountId);
    let changed = false;

    for (const item of brandItems) {
      const key = String(item.id);
      const local = localByBlotatoId.get(key);
      if (!local) {
        const imported = toLocalRecord(item);
        posts.push(imported);
        localByBlotatoId.set(key, imported);
        changed = true;
        continue;
      }

      if (local.scheduled_at !== item.scheduledAt) {
        local.scheduled_at = item.scheduledAt;
        changed = true;
      }
      const slot = inferSlot(item.scheduledAt);
      if (local.slot !== slot) {
        local.slot = slot;
        changed = true;
      }
      if (!local.ad_ids?.length) {
        local.ad_ids = item.draft.content.mediaUrls.map((url: string) => url.split('/').pop() ?? url);
        changed = true;
      }
    }

    if (changed) {
      await saveScheduled(brand, posts);
    }
  } catch {
    // Blotato unavailable; local JSON remains the source of truth.
  }

  return NextResponse.json({ posts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  if (!await checkAuth(brand)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { action, blotato_id } = body;

  if (action === 'approve' || action === 'reject') {
    const posts = await loadScheduled(brand);
    const idx = posts.findIndex(p =>
      String(p.blotato_id) === String(blotato_id) || p.blotato_id === blotato_id
    );
    if (idx !== -1) {
      posts[idx].status = action === 'approve' ? 'approved' : 'rejected';
      await saveScheduled(brand, posts);
    }

    if (action === 'reject' && idx !== -1) {
      try {
        await deleteSchedule(String(blotato_id));
      } catch {
        // Local state still reflects rejection even if Blotato is unavailable.
      }
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'delete') {
    try {
      await deleteSchedule(blotato_id);
    } catch {
      // continue even if Blotato fails
    }
    const posts = await loadScheduled(brand);
    const filtered = posts.filter(p =>
      String(p.blotato_id) !== String(blotato_id) && p.blotato_id !== blotato_id
    );
    await saveScheduled(brand, filtered);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
