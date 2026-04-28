import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

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

function getQueue(): Queue {
  if (existsSync(QUEUE_FILE)) {
    try {
      return JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    } catch { /* */ }
  }
  return { jobs: [], last_updated: '' };
}

function addJobToQueue(job: Job) {
  const queueDir = path.dirname(QUEUE_FILE);
  if (!existsSync(queueDir)) mkdirSync(queueDir, { recursive: true });
  
  const queue = getQueue();
  
  // Check if same job already pending
  if (job.type === 'generate_ads') {
    const existing = queue.jobs.find(j => j.type === 'generate_ads' && j.brand === job.brand && j.status === 'pending');
    if (existing) {
      return { error: 'Generate ads job already pending for this brand' };
    }
  }
  
  queue.jobs.push(job);
  queue.last_updated = new Date().toISOString();
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  return { success: true };
}

// GET /api/queue - check queue status
export async function GET(req: NextRequest) {
  if (!existsSync(QUEUE_FILE)) {
    return NextResponse.json({ jobs: [], status: 'empty' });
  }
  
  try {
    const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    return NextResponse.json(queue);
  } catch {
    return NextResponse.json({ jobs: [], status: 'error' });
  }
}

// POST /api/queue - add job to queue
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, brand, ...rest } = body;

  if (!type || !brand) {
    return NextResponse.json({ error: 'type and brand required' }, { status: 400 });
  }

  const validTypes = ['scrape', 'generate_ads', 'compose', 'schedule'];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid job type' }, { status: 400 });
  }

  const job: Job = {
    id: `${type}-${Date.now()}`,
    type,
    brand,
    status: 'pending',
    addedAt: new Date().toISOString(),
    ...rest,
  };

  const result = addJobToQueue(job);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, job });
}
