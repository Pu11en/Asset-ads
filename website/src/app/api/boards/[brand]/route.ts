import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const BOARDS_DIR = '/home/drewp/asset-ads/state/boards';
const QUEUE_FILE = '/home/drewp/asset-ads/state/board-queue/queue.json';

type Job = {
  id: string;
  type: string;
  brand: string;
  url?: string;
  pool?: string;
  maxImages?: number;
  status: string;
  addedAt: string;
};

type Queue = {
  jobs: Job[];
  last_updated: string;
};

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

function addJobToQueue(job: Job) {
  const queueDir = path.dirname(QUEUE_FILE);
  if (!existsSync(queueDir)) mkdirSync(queueDir, { recursive: true });

  let queue: Queue = { jobs: [], last_updated: new Date().toISOString() };
  if (existsSync(QUEUE_FILE)) {
    try {
      queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    } catch { /* use empty */ }
  }

  queue.jobs.push(job);
  queue.last_updated = new Date().toISOString();
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function getQueue(): Queue {
  if (existsSync(QUEUE_FILE)) {
    try {
      return JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    } catch { /* */ }
  }
  return { jobs: [], last_updated: '' };
}

function triggerScrape(brand: string, url: string, pool: string, maxImages: number) {
  const REPO_ROOT = '/home/drewp/asset-ads';
  const SCRAPER = REPO_ROOT + '/skill/scripts/drain_board.py';
  const cmd = `cd ${REPO_ROOT} && python3 ${SCRAPER} --brand ${brand} --board-url "${url}" --pool ${pool} --max-images ${maxImages} &`;
  spawn('bash', ['-c', cmd], { detached: true, stdio: 'ignore' });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const boards = getBoards(brand);
  return NextResponse.json({ brand, boards });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const body = await request.json();
  const { url, pool = 'drinks', maxImages = 100 } = body;

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  const boards = getBoards(brand);

  const board = {
    url,
    pool,
    maxImages,
    addedAt: new Date().toISOString(),
    status: 'pending',
  };

  boards.push(board);
  saveBoards(brand, boards);

  // Add scrape job to queue
  const job: Job = {
    id: `scrape-${Date.now()}`,
    type: 'scrape',
    brand,
    url,
    pool,
    maxImages,
    status: 'pending',
    addedAt: new Date().toISOString(),
  };
  addJobToQueue(job);

  return NextResponse.json({ success: true, board, job });
}
