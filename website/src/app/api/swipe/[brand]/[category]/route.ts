import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function isImage(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

// Maps URL slug (used in public/images/) to actual physical directory name
// Some brands use different names in URLs vs filesystem (e.g. island-splash: "drinks" in URL = "all-drinks" on disk)
const POOL_SLUG_MAP: Record<string, Record<string, string>> = {
  "island-splash": {
    "all-drinks": "drinks",   // URL slug -> physical dir
    "drinks": "drinks",
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
        // poolBase already contains the category name? Use it directly
        if (poolBase.endsWith(category) || poolBase.includes(`/${category}`)) {
          return { poolDir: poolBase, poolSlug: slug };
        }
        return { poolDir: path.join(poolBase, category), poolSlug: slug };
      }
    } catch (e) {
      console.error("Config parse error:", e);
    }
  }
  const slug = resolvePoolSlug(brand, category);
  return { poolDir: path.join(REPO_ROOT, "brand_assets", brand, category), poolSlug: slug };
}

async function getRefsInDir(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files.filter(isImage).map(f => path.join(dir, f));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; category: string }> }
) {
  const { brand, category } = await params;

  const poolDir = await getPoolDir(brand, category);
  if (!poolDir) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  // Get all images in each subdir
  const [unapproved, approved, rejected, used] = await Promise.all([
    getRefsInDir(poolDir.poolDir),
    getRefsInDir(path.join(poolDir.poolDir, "approved")),
    getRefsInDir(path.join(poolDir.poolDir, "rejected")),
    getRefsInDir(path.join(poolDir.poolDir, "used")),
  ]);

  // Calculate processed files
  const processedFiles = new Set([
    ...approved.map(f => path.basename(f)),
    ...rejected.map(f => path.basename(f)),
    ...used.map(f => path.basename(f)),
  ]);

  // Filter unapproved
  const unapprovedFiltered = unapproved.filter(f => !processedFiles.has(path.basename(f)));

  // Get state from state_manager's JSON
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
      rejected: rejected.length,
      used: used.length,
      total_unapproved: unapprovedFiltered.length,
    },
    state,
  });
}
