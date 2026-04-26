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
  const filePath = path.join(process.cwd(), 'public', 'data', 'scheduled', `${brand}.json`);
  try {
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.posts ?? []);
  } catch {
    return [];
  }
}

export async function saveScheduled(brand: string, posts: ScheduledPost[]): Promise<void> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'scheduled', `${brand}.json`);
  await writeFile(filePath, JSON.stringify(posts, null, 2));
}

export async function updatePostStatus(
  brand: string,
  blotatoId: string,
  status: ScheduledPost['status']
): Promise<void> {
  const posts = await loadScheduled(brand);
  const idx = posts.findIndex(p => p.blotato_id === blotatoId);
  if (idx !== -1) {
    posts[idx].status = status;
    await saveScheduled(brand, posts);
  }
}
