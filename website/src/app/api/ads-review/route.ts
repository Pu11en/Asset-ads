import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const APPROVAL_DIR = '/home/drewp/asset-ads/output/ad-approval';
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 });

  const state = await getApprovalState(brand);
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { brand, adId, action } = body;

  if (!brand || !adId || !action) {
    return NextResponse.json({ error: 'brand, adId, action required' }, { status: 400 });
  }

  if (!['approve', 'skip', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  const state = await getApprovalState(brand);
  if (!state) {
    return NextResponse.json({ error: 'approval state not found for brand' }, { status: 404 });
  }

  if (!state.ads[adId]) {
    return NextResponse.json({ error: 'ad not found in state' }, { status: 404 });
  }

  const ad = state.ads[adId];
  const prevStatus = ad.status;

  if (action === 'reset') {
    ad.status = 'pending';
    ad.reviewed_at = null;
    if (prevStatus === 'approved') state.approved_count--;
    else if (prevStatus === 'skipped') state.skipped_count--;
    state.pending_count++;
  } else if (action === 'approve') {
    if (prevStatus === 'approved') return NextResponse.json({ error: 'already approved' }, { status: 409 });
    if (prevStatus !== 'pending' && prevStatus !== 'skipped') {
      // first time being reviewed — no decrement needed
    } else if (prevStatus === 'pending') {
      state.pending_count--;
    } else if (prevStatus === 'skipped') {
      state.skipped_count--;
    }
    ad.status = 'approved';
    ad.reviewed_at = new Date().toISOString();
    state.approved_count++;
  } else if (action === 'skip') {
    if (prevStatus === 'skipped') return NextResponse.json({ error: 'already skipped' }, { status: 409 });
    if (prevStatus !== 'pending' && prevStatus !== 'approved') {
      // first time being reviewed
    } else if (prevStatus === 'pending') {
      state.pending_count--;
    } else if (prevStatus === 'approved') {
      state.approved_count--;
    }
    ad.status = 'skipped';
    ad.reviewed_at = new Date().toISOString();
    state.skipped_count++;
  }

  await saveApprovalState(brand, state);

  return NextResponse.json({
    success: true,
    adId,
    action,
    pending_count: state.pending_count,
    approved_count: state.approved_count,
    skipped_count: state.skipped_count,
    all_reviewed: state.pending_count === 0,
  });
}
