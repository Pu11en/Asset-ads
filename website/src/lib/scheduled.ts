import { readFile, writeFile } from 'fs/promises';
import path from 'path';

export type ScheduledPost = {
  id: string;
  blotato_id: string;
  ad_ids: string[];
  caption: string;
  hashtags: string;
  scheduled_at: string;
  slot: '9am' | '5pm';
  platform: 'instagram';
  status: 'pending' | 'preapproved' | 'approved' | 'rejected' | 'posted' | 'failed';
};

export async function loadScheduled(brand: string): Promise<ScheduledPost[]> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'scheduled', brand + '.json');
  try {
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const posts: any[] = Array.isArray(data) ? data : (data.posts || []);
    return posts.map((p) => {
      const adIds = p.ad_ids || p.ad_filenames || [];
      const id = p.id || p.post_id || '';
      const blotatoId = p.blotato_id || p.blotatoPostId || id;
      const scheduledAt = p.scheduled_at || p.scheduledTime || p.scheduledAt || '';
      let slot: '9am' | '5pm' = '5pm';
      if (p.slot) {
        slot = p.slot;
      } else if (scheduledAt.includes('T09:')) {
        slot = '9am';
      }
      let status: ScheduledPost['status'] = 'pending';
      if (p.blotatoStatus === 'published') {
        status = 'posted';
      } else if (p.status === 'preapproved' || p.status === 'approved' || p.status === 'rejected') {
        status = p.status;
      }
      return {
        id,
        blotato_id: blotatoId,
        ad_ids: adIds,
        caption: p.caption || '',
        hashtags: p.hashtags || '',
        scheduled_at: scheduledAt,
        slot,
        platform: 'instagram',
        status,
      };
    });
  } catch {
    return [];
  }
}

export async function saveScheduled(brand: string, posts: ScheduledPost[]): Promise<void> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'scheduled', brand + '.json');
  await writeFile(filePath, JSON.stringify({ posts }, null, 2));
}

export async function updatePostStatus(
  brand: string,
  blotatoId: string,
  status: ScheduledPost['status']
): Promise<void> {
  const posts = await loadScheduled(brand);
  const idx = posts.findIndex((p) => p.blotato_id === blotatoId);
  if (idx !== -1) {
    posts[idx].status = status;
    await saveScheduled(brand, posts);
  }
}
