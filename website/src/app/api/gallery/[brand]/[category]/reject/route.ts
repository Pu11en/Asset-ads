import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, unlinkSync } from "fs";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";

const POOL_SLUG_MAP: Record<string, Record<string, string>> = {
  "island-splash": { "all-drinks": "drinks", "drinks": "drinks" },
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

  const results: { filename: string; success: boolean; error?: string }[] = [];

  for (const filename of filenames) {
    try {
      const filePath = path.join(poolDir, filename);

      if (!existsSync(filePath)) {
        results.push({ filename, success: false, error: "File not found" });
        continue;
      }

      // Permanently delete the file
      unlinkSync(filePath);
      results.push({ filename, success: true });
    } catch (err) {
      results.push({ filename, success: false, error: String(err) });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return NextResponse.json({
    rejected: successCount,
    failed: results.filter(r => !r.success).length,
    results,
  });
}
