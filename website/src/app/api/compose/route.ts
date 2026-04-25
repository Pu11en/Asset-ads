import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const { brand } = body;

  if (!brand) {
    return NextResponse.json({ error: 'brand required' }, { status: 400 });
  }

  const scriptPath = '/home/drewp/asset-ads/skill/scripts/compose_posts.py';

  return new Promise<Response>((resolve) => {
    const proc = spawn('python3', [scriptPath, '--brand', brand], {
      cwd: '/home/drewp/asset-ads',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(NextResponse.json({ success: true, stdout, brand }));
      } else {
        resolve(NextResponse.json({ error: 'compose failed', stderr, stdout }, { status: 500 }));
      }
    });
  });
}
