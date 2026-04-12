import { readFile, writeFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DELETIONS = join(__dirname, '..', 'deletions.json');

export async function POST(req) {
  try {
    const { filename } = await req.json();
    if (!filename) return json({ ok: false, error: 'Missing filename' }, 400);

    // Block dangerous filenames
    if (filename.includes('..') || filename.includes('/')) {
      return json({ ok: false, error: 'Invalid filename' }, 400);
    }

    let queue = [];
    try {
      queue = JSON.parse(await readFile(DELETIONS, 'utf-8'));
    } catch (e) { /* not found */ }

    if (!queue.find(q => q.filename === filename)) {
      queue.push({ filename, ts: Date.now() });
      await writeFile(DELETIONS, JSON.stringify(queue));
    }

    return json({ ok: true, message: 'Queued', queueLength: queue.length });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
