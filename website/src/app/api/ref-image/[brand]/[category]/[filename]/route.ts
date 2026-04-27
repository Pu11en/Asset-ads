import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";

const POOL_SLUG_MAP: Record<string, Record<string, string>> = {
  "island-splash": {
    "all-drinks": "drinks",
    "drinks": "drinks",
  },
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
        if (poolBase.endsWith(category) || poolBase.includes(`/${category}`)) {
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

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; category: string; filename: string }> }
) {
  const { brand, category, filename } = await params;
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder"); // approved | rejected | used | null (root)

  // Security: prevent path traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const poolDir = getPoolDir(brand, category);
  const filePath = folder
    ? path.join(poolDir, folder, filename)
    : path.join(poolDir, filename);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream";

  try {
    const fileBuffer = readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to read image" }, { status: 500 });
  }
}
