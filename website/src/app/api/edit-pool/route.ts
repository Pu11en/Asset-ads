import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const EDIT_DIR = '/home/drewp/asset-ads/output/edit-pool';
const EDIT_FILE = `${EDIT_DIR}/{brand}.json`;

async function getEditState(brand: string): Promise<any> {
  const filePath = EDIT_FILE.replace('{brand}', brand);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { brand, ads: [] };
  }
}

async function saveEditState(brand: string, state: any) {
  const filePath = EDIT_FILE.replace('{brand}', brand);
  if (!existsSync(EDIT_DIR)) {
    await mkdir(EDIT_DIR, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(state, null, 2));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 });

  const state = await getEditState(brand);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { brand, adId, action } = body;

  if (!brand) {
    return NextResponse.json({ error: 'brand required' }, { status: 400 });
  }

  // Add ad to edit pool
  if (action === 'add' && adId) {
    const state = await getEditState(brand);
    if (!state.ads.includes(adId)) {
      state.ads.push(adId);
      await saveEditState(brand, state);
    }
    return NextResponse.json({ success: true, editCount: state.ads.length });
  }

  // Remove ad from edit pool
  if (action === 'remove' && adId) {
    const state = await getEditState(brand);
    state.ads = state.ads.filter((a: string) => a !== adId);
    await saveEditState(brand, state);
    return NextResponse.json({ success: true, editCount: state.ads.length });
  }

  // Clear edit pool
  if (action === 'clear') {
    await saveEditState(brand, { brand, ads: [] });
    return NextResponse.json({ success: true, editCount: 0 });
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 });
}
