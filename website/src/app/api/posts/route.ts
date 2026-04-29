import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const REPO_ROOT = "/home/drewp/asset-ads";
const POSTS_DIR = path.join(REPO_ROOT, "output", "posts");
const SCHEDULED_DIR = path.join(REPO_ROOT, "output", "scheduled");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand");
  const type = searchParams.get("type") || "composed";

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
      posts.push({ ...data, filename: file });
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

  if (action === "undo_schedule") {
    post.scheduled = undefined;
    post.blotatoPostId = undefined;
    post.scheduledAt = undefined;
    post.scheduledTime = undefined;
    post.publicUrl = undefined;
    await writeFile(filePath, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true, post_id, action: "undo_schedule" });
  }

  if (action === "delete_post") {
    const postIndex = data.posts.findIndex((p: any) => p.post_id === post_id);
    if (postIndex === -1) {
      return NextResponse.json({ error: "post not found" }, { status: 404 });
    }
    const removedPost = data.posts.splice(postIndex, 1)[0];
    await writeFile(filePath, JSON.stringify(data, null, 2));

    const APPROVAL_FILE = path.join(REPO_ROOT, "output", "ad-approval", `${brand}.json`);
    if (existsSync(APPROVAL_FILE)) {
      const approvalContent = await readFile(APPROVAL_FILE, "utf8");
      const approval = JSON.parse(approvalContent);
      const adKeys = removedPost.ad_filenames || [];
      for (const fn of adKeys) {
        const base = fn.replace(/\.(instructions|png|jpg|jpeg)$/, "");
        for (const key of [base, base + ".png", base + ".instructions"]) {
          if (approval.ads[key]) {
            approval.ads[key].status = "approved";
          }
        }
      }
      let approved_count = 0;
      let consumed_count = 0;
      for (const v of Object.values(approval.ads)) {
        if (v.status === "approved") approved_count++;
        else if (v.status === "consumed") consumed_count++;
      }
      approval.approved_count = approved_count;
      approval.consumed_count = consumed_count;
      await writeFile(APPROVAL_FILE, JSON.stringify(approval, null, 2));
    }

    return NextResponse.json({ success: true, post_id, action: "delete_post" });
  }

  post.status = "approved";
  await writeFile(filePath, JSON.stringify(data, null, 2));
  return NextResponse.json({ success: true, post_id, status: "approved" });
}
