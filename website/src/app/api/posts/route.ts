import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";
const POSTS_DIR = path.join(REPO_ROOT, "output", "posts");
const SCHEDULED_DIR = path.join(REPO_ROOT, "output", "scheduled");
const APPROVAL_DIR = path.join(REPO_ROOT, "output", "post-approval");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand");
  const type = searchParams.get("type") || "composed"; // composed or scheduled

  try {
    const targetDir = type === "scheduled" ? SCHEDULED_DIR : POSTS_DIR;

    if (!existsSync(targetDir)) {
      return NextResponse.json({ posts: [], message: `No ${type} posts directory` });
    }

    const files = await readdir(targetDir);
    const postFiles = files
      .filter(f => f.endsWith(".json") && (!brand || f.startsWith(brand)))
      .sort()
      .reverse();

    const posts = [];
    for (const file of postFiles) {
      const content = await readFile(path.join(targetDir, file), "utf8");
      const data = JSON.parse(content);
      posts.push({
        ...data,
        filename: file,
      });
    }

    return NextResponse.json({ posts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { brand, filename, post_id, action } = body;

  if (!brand || !filename || !post_id) {
    return NextResponse.json({ error: "brand, filename, post_id required" }, { status: 400 });
  }

  const filePath = path.join(POSTS_DIR, filename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "post file not found" }, { status: 404 });
  }

  const content = await readFile(filePath, "utf8");
  const data = JSON.parse(content);

  const post = data.posts.find((p: any) => p.post_id === post_id);
  if (!post) {
    return NextResponse.json({ error: "post not found" }, { status: 404 });
  }

  if (action === 'undo_schedule') {
    // Reset scheduled fields so post goes back to draft
    post.scheduled = undefined;
    post.blotatoPostId = undefined;
    post.scheduledAt = undefined;
    post.scheduledTime = undefined;
    post.publicUrl = undefined;
    await writeFile(filePath, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true, post_id, action: 'undo_schedule' });
  }

  // Default: mark as approved
  post.status = "approved";
  await writeFile(filePath, JSON.stringify(data, null, 2));

  return NextResponse.json({ success: true, post_id, status: "approved" });
}
