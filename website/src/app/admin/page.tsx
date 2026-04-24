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

export default async function AdminPage() {
  const jar = await cookies();
  const isAdmin = jar.get("admin")?.value === "true";
  if (!isAdmin) redirect("/admin/login");

  const [islandAds, cincoAds, islandScheduled, cincoScheduled] = await Promise.all([
    loadAds("island-splash"),
    loadAds("cinco-h-ranch"),
    loadScheduled("island-splash"),
    loadScheduled("cinco-h-ranch"),
  ]);

  return (
    <AdminView
      islandAds={islandAds}
      cincoAds={cincoAds}
      islandScheduled={islandScheduled}
      cincoScheduled={cincoScheduled}
    />
  );
}
