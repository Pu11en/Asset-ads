import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  const brandSlug = String(brand || '');
  const manifestPath = path.join(process.cwd(), 'public', 'data', 'refs', brandSlug + '.json');

  if (!existsSync(manifestPath)) {
    return NextResponse.json({ pools: {}, products: [], total: 0 });
  }

  try {
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as { pools?: Record<string, { images: string[] }>; products?: unknown[] };
    const pools = manifest.pools || {};
    const allImages = Object.values(pools).flatMap((p) => p.images || []);
    return NextResponse.json({ ...manifest, total: allImages.length });
  } catch {
    return NextResponse.json({ pools: {}, products: [], total: 0 });
  }
}
