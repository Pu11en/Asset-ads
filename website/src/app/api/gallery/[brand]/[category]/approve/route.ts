import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { copyFile, mkdir } from "fs/promises";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";

const POOL_SLUG_MAP: Record<string, Record<string, string>> = {
  "island-splash": { "drinks": "drinks" },
  "cinco-h-ranch": { "skincare": "skincare" },
};

function resolvePoolSlug(brand: string, category: string): string {
  return POOL_SLUG_MAP[brand]?.[category] ?? category;
}

function getPoolDir(brand: string, category: string): string {
  const configPath = path.join(REPO_ROOT, "brands", `${brand}.json`);
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf8");
      const config = JSON.parse(content);
      if (config.paths?.pool_dir) {
        const poolBase = config.paths.pool_dir;
        if (poolBase.includes(category)) {
          return poolBase;
        }
        return path.join(poolBase, category);
      }
    } catch (e) {
      console.error("Config parse error:", e);
    }
  }
  return path.join(REPO_ROOT, "brand_assets", brand, category);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; category: string }> }
) {
  const { brand, category } = await params;
  const body = await request.json();
  const { filenames } = body as { filenames: string[] };

  if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
    return NextResponse.json({ error: "No filenames provided" }, { status: 400 });
  }

  const poolDir = getPoolDir(brand, category);
  const poolSlug = resolvePoolSlug(brand, category);

  const approvedDir = path.join(poolDir, "approved");
  const publicApprovedDir = path.join(REPO_ROOT, "website", "public", "images", "refs", brand, poolSlug, "approved");
  await mkdir(approvedDir, { recursive: true });
  await mkdir(publicApprovedDir, { recursive: true });

  const results: { filename: string; success: boolean; error?: string }[] = [];

  for (const filename of filenames) {
    try {
      const src = path.join(poolDir, filename);
      const dst = path.join(approvedDir, filename);

      if (!existsSync(src)) {
        results.push({ filename, success: false, error: "File not found" });
        continue;
      }

      await copyFile(src, dst);
      // Also copy to public folder so website can serve it
      const publicDst = path.join(publicApprovedDir, filename);
      await copyFile(src, publicDst);
      results.push({ filename, success: true });
    } catch (err) {
      results.push({ filename, success: false, error: String(err) });
    }
  }

  const successCount = results.filter(r => r.success).length;

  // Update state file directly
  try {
    const statePath = path.join(REPO_ROOT, "state", "ref-pool", brand, poolSlug, "index.json");
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
    state.approved = (state.approved || 0) + successCount;
    state.unapproved = Math.max(0, (state.unapproved || 0) - successCount);
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Failed to update state:", err);
  }

  return NextResponse.json({
    approved: successCount,
    failed: results.filter(r => !r.success).length,
    results,
  });
}
