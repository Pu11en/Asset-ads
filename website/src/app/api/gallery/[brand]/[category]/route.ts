import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const SCRAPER = REPO_ROOT + "/skill/scripts/drain_board.py";
const QUEUE_FILE = REPO_ROOT + "/state/board-queue.json";

function isImage(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

const POOL_SLUG_MAP: Record<string, Record<string, string>> = {
  "island-splash": {
    "drinks": "drinks",
  },
  "cinco-h-ranch": {
    "skincare": "skincare",
  },
};

function resolvePoolSlug(brand: string, category: string): string {
  return POOL_SLUG_MAP[brand]?.[category] ?? category;
}

async function getPoolDir(brand: string, category: string): Promise<{ poolDir: string; poolSlug: string } | null> {
  const configPath = path.join(REPO_ROOT, "brands", `${brand}.json`);
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf8");
      const config = JSON.parse(content);
      if (config.paths?.pool_dir) {
        const poolBase = config.paths.pool_dir;
        const slug = resolvePoolSlug(brand, category);
        if (poolBase.endsWith(slug) || poolBase.includes(`/${slug}`)) {
          return { poolDir: poolBase, poolSlug: slug };
        }
        return { poolDir: path.join(poolBase, slug), poolSlug: slug };
      }
    } catch (e) {
      console.error("Config parse error:", e);
    }
  }
  const slug = resolvePoolSlug(brand, category);
  return { poolDir: path.join(REPO_ROOT, "brand_assets", brand, slug), poolSlug: slug };
}

async function getRefsInDir(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files.filter(isImage).map(f => path.join(dir, f));
}

function processBoardQueue() {
  if (!existsSync(QUEUE_FILE)) return;
  try {
    const queueData = readFileSync(QUEUE_FILE, "utf8");
    const queue = JSON.parse(queueData);
    const pending = queue.filter((b: any) => b.status === "pending");
    if (pending.length === 0) return;

    const board = pending[0];
    const cmd = `cd ${REPO_ROOT} && python3 ${SCRAPER} --brand ${board.brand} --board-url "${board.boardUrl}" --pool ${board.pool} --max-images ${board.maxImages} &`;
    spawn("bash", ["-c", cmd], { detached: true, stdio: "ignore" });
  } catch (e) {
    console.error("Queue processing error:", e);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; category: string }> }
) {
  const { brand, category } = await params;

  // all-drinks doesn't exist — it's a legacy URL artifact
  if (category === "all-drinks") {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Process any pending boards in background
  processBoardQueue();

  const poolDir = await getPoolDir(brand, category);
  if (!poolDir) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const [unapproved, approved, rejected, used] = await Promise.all([
    getRefsInDir(poolDir.poolDir),
    getRefsInDir(path.join(poolDir.poolDir, "approved")),
    getRefsInDir(path.join(poolDir.poolDir, "rejected")),
    getRefsInDir(path.join(poolDir.poolDir, "used")),
  ]);

  const processedFiles = new Set([
    ...approved.map(f => path.basename(f)),
    ...rejected.map(f => path.basename(f)),
    ...used.map(f => path.basename(f)),
  ]);

  const unapprovedFiltered = unapproved.filter(f => !processedFiles.has(path.basename(f)));

  const statePath = path.join(REPO_ROOT, "state", "ref-pool", brand, poolDir.poolSlug, "index.json");
  let state = { approved: 0, rejected: 0, used: 0, trigger_threshold: 3, triggered: false };
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf8"));
    } catch {}
  }

  return NextResponse.json({
    brand,
    category,
    pool_dir: poolDir.poolDir,
    pool_slug: poolDir.poolSlug,
    refs: {
      unapproved: unapprovedFiltered.map(f => ({
        filename: path.basename(f),
        path: f,
        url: `/images/refs/${brand}/${poolDir.poolSlug}/${path.basename(f)}`,
      })),
      approved: approved.length,
      approved_files: approved.map(f => ({
        filename: path.basename(f),
        path: f,
        url: `/images/refs/${brand}/${poolDir.poolSlug}/approved/${path.basename(f)}`,
      })),
      rejected: rejected.length,
      used: used.length,
      total_unapproved: unapprovedFiltered.length,
    },
    state,
  });
}
