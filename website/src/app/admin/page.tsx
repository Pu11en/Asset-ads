import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { adminSignOut } from "../actions";
import { AdminView } from "./components/AdminView";

export const dynamic = "force-dynamic";

type Ad = { id: string; filename: string; path: string; product_name?: string; caption?: string; status?: string; created_at?: string };
type ScheduledPost = { id: string; ad_ids: string[]; caption: string; hashtags?: string; scheduled_at: string; platform: string; status: string };
type ApprovalState = { pending_count: number; approved_count: number; bad_count: number; ads: Record<string, { status: string; filename: string; reviewed_at: string | null }> };

async function loadAds(slug: string): Promise<Ad[]> {
  try {
    const filePath = path.join(process.cwd(), "public", "data", `${slug}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Ad[];
  } catch { return []; }
}

async function loadScheduled(slug: string): Promise<ScheduledPost[]> {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "scheduled", `${slug}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ScheduledPost[];
  } catch { return []; }
}

async function loadApproval(brand: string): Promise<ApprovalState | null> {
  try {
    const filePath = path.join(process.cwd(), "..", "output", "ad-approval", `${brand}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ApprovalState;
  } catch { return null; }
}

// Filter ads to only show non-consumed ones
// Normalize ad key: strip .png to match approval JSON keys (which may or may not have .png)
function getAdKey(ad: Ad): string {
  const base = ad.id || ad.filename;
  return base.replace(/\.png$/, '').replace(/\.jpg$/, '').replace(/\.jpeg$/, '');
}

function filterPoolAds(ads: Ad[], approval: ApprovalState | null): Ad[] {
  if (!approval) return ads;
  return ads.filter(ad => {
    const key = getAdKey(ad);
    const adStatus = approval.ads[key]?.status;
    // Only show ads that are new (never reviewed) or pending review
    // approved/bad/consumed ads are NOT shown in the pool
    return !adStatus || adStatus === 'pending';
  });
}

export default async function AdminPage() {
  const jar = await cookies();
  const isAdmin = jar.get("admin")?.value === "true";
  if (!isAdmin) redirect("/admin/login");

  const [islandAds, cincoAds, islandScheduled, cincoScheduled, islandApproval, cincoApproval] = await Promise.all([
    loadAds("island-splash"),
    loadAds("cinco-h-ranch"),
    loadScheduled("island-splash"),
    loadScheduled("cinco-h-ranch"),
    loadApproval("island-splash"),
    loadApproval("cinco-h-ranch"),
  ]);

  return (
    <AdminView
      islandAds={islandAds}
      cincoAds={cincoAds}
      islandApproval={islandApproval}
      cincoApproval={cincoApproval}
    />
  );
}
