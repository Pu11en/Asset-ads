import { NextRequest, NextResponse } from 'next/server';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const BOARDS_DIR = '/home/drewp/asset-ads/state/boards';

function getBoardsFile(brand: string) {
  return path.join(BOARDS_DIR, `${brand}.json`);
}

function getBoards(brand: string): any[] {
  const file = getBoardsFile(brand);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch { return []; }
}

function saveBoards(brand: string, boards: any[]) {
  const dir = path.dirname(getBoardsFile(brand));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getBoardsFile(brand), JSON.stringify(boards, null, 2));
}

// GET /api/boards/[brand] - list boards for brand
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  return NextResponse.json({ boards: getBoards(brand) });
}

// POST /api/boards/[brand] - add a board
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  const body = await req.json();
  const { boardUrl, pool = 'drinks', maxImages = 100 } = body;

  if (!boardUrl) {
    return NextResponse.json({ error: 'boardUrl required' }, { status: 400 });
  }

  const boards = getBoards(brand);

  if (boards.some(b => b.url === boardUrl)) {
    return NextResponse.json({ error: 'Board already added' }, { status: 400 });
  }

  const board = {
    id: Date.now().toString(),
    url: boardUrl,
    pool,
    maxImages,
    status: 'pending',
    addedAt: new Date().toISOString(),
    imageCount: 0,
    lastScraped: null,
  };

  boards.push(board);
  saveBoards(brand, boards);

  // Run scraper immediately (synchronous - takes a few seconds)
  try {
    execSync(`cd /home/drewp/asset-ads && python3 skill/scripts/drain_board.py --brand ${brand} --board-url "${boardUrl}" --pool ${pool} --max-images ${maxImages}`, {
      stdio: 'pipe',
      timeout: 120000
    });
  } catch (e) {
    console.error('Scraper error:', e);
  }

  return NextResponse.json({ success: true, board });
}

// DELETE /api/boards/[brand] - remove a board
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  const body = await req.json();
  const { boardId } = body;

  const boards = getBoards(brand).filter(b => b.id !== boardId);
  saveBoards(brand, boards);

  return NextResponse.json({ success: true });
}
