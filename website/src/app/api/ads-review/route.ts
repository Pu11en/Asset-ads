import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const APPROVAL_DIR = '/home/drewp/asset-ads/output/ad-approval';
const ADS_DIR = '/home/drewp/asset-ads/output';
const BAD_DIR = '/home/drewp/asset-ads/output/ads-bad';
const APPROVAL_FILE = `${APPROVAL_DIR}/{brand}.json`;

async function getApprovalState(brand: string): Promise<any> {
  const filePath = APPROVAL_FILE.replace('{brand}', brand);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveApprovalState(brand: string, state: any) {
  const filePath = APPROVAL_FILE.replace('{brand}', brand);
  if (!existsSync(APPROVAL_DIR)) {
    await mkdir(APPROVAL_DIR, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(state, null, 2));
}

async function moveAdToBad(brand: string, adId: string) {
  // adId is like "cinco-h-ranch_20260424_034759_686" or "cinco-h-ranch_20260424_034759_686.png"
  const base = adId.replace(/\.png$/, '').replace(/\.jpg$/, '');
  const brandBadDir = path.join(BAD_DIR, brand);
  await mkdir(brandBadDir, { recursive: true });

  const candidates = [
    path.join(ADS_DIR, `${base}.png`),
    path.join(ADS_DIR, `${base}.jpg`),
    path.join(ADS_DIR, `${base}.instructions.txt`),
    path.join(ADS_DIR, `${base}.jpeg`),
  ];

  for (const src of candidates) {
    if (existsSync(src)) {
      const dst = path.join(brandBadDir, path.basename(src));
      try {
        await rename(src, dst);
      } catch {
        // already moved or missing
      }
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 });

  const state = getApprovalState(brand);
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { brand, adId, action } = body;

  if (!brand || !adId || !action) {
    return NextResponse.json({ error: 'brand, adId, action required' }, { status: 400 });
  }

  if (!['approve', 'bad', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  const state = await getApprovalState(brand);
  if (!state) {
    return NextResponse.json({ error: 'approval state not found for brand' }, { status: 404 });
  }

  // Normalize adId — strip extension if present
  const normalizedId = adId.replace(/\.png$/, '').replace(/\.jpg$/, '').replace(/\.jpeg$/, '');
  const ad = state.ads[normalizedId] || state.ads[adId];
  if (!ad) {
    return NextResponse.json({ error: 'ad not found in state' }, { status: 404 });
  }

  const prevStatus = ad.status;

  if (action === 'reset') {
    ad.status = 'pending';
    ad.reviewed_at = null;
    if (prevStatus === 'approved') state.approved_count--;
    else if (prevStatus === 'bad') state.bad_count--;
    state.pending_count++;
  } else if (action === 'approve') {
    if (prevStatus === 'approved') return NextResponse.json({ error: 'already approved' }, { status: 409 });
    if (prevStatus === 'pending') {
      state.pending_count--;
    } else if (prevStatus === 'bad') {
      state.bad_count--;
    }
    ad.status = 'approved';
    ad.reviewed_at = new Date().toISOString();
    state.approved_count++;
  } else if (action === 'bad') {
    if (prevStatus === 'bad') return NextResponse.json({ error: 'already marked bad' }, { status: 409 });
    if (prevStatus === 'pending') {
      state.pending_count--;
    } else if (prevStatus === 'approved') {
      state.approved_count--;
    }
    ad.status = 'bad';
    ad.reviewed_at = new Date().toISOString();
    state.bad_count = (state.bad_count || 0) + 1;

    // Move the ad files to ads-bad/{brand}/
    await moveAdToBad(brand, normalizedId);
    await moveAdToBad(brand, adId);
  }

  await saveApprovalState(brand, state);

  return NextResponse.json({
    success: true,
    adId: normalizedId,
    action,
    pending_count: state.pending_count,
    approved_count: state.approved_count,
    bad_count: state.bad_count || 0,
    all_reviewed: state.pending_count === 0,
  });
}
