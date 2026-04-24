import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadScheduled, saveScheduled } from '@/lib/scheduled';

export const dynamic = 'force-dynamic';

async function checkAuth(brand: string): Promise<boolean> {
  const jar = await cookies();
  const auth = jar.get('auth')?.value;
  const isAdmin = jar.get('admin')?.value === 'true';
  return isAdmin || auth === brand;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  if (!await checkAuth(brand)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const posts = await loadScheduled(brand);
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

    return NextResponse.json({ success: true });
  }

  if (action === 'delete') {
    const posts = await loadScheduled(brand);
    const filtered = posts.filter(p =>
      String(p.blotato_id) !== String(blotato_id) && p.blotato_id !== blotato_id
    );
    await saveScheduled(brand, filtered);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
