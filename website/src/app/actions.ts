"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function adminSignIn(formData: FormData) {
  if (!ADMIN_PASSWORD) {
    redirect("/admin?error=1");
  }
  const password = String(formData.get("password") ?? "");

  if (password !== ADMIN_PASSWORD) {
    redirect("/admin?error=1");
  }

  const jar = await cookies();
  jar.set("admin", "true", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/admin");
}

export async function adminSignOut() {
  const jar = await cookies();
  jar.delete("admin");
  redirect("/admin/login");
}

export async function signIn(formData: FormData) {
  const ISLAND_SPLASH_PASSWORD = process.env.ISLAND_SPLASH_PASSWORD;
  const CINCO_H_RANCH_PASSWORD = process.env.CINCO_H_RANCH_PASSWORD;
  if (!ISLAND_SPLASH_PASSWORD || !CINCO_H_RANCH_PASSWORD) {
    throw new Error("Brand passwords not configured in environment");
  }
  const PASSWORDS: Record<string, string> = {
    "island-splash": ISLAND_SPLASH_PASSWORD,
    "cinco-h-ranch": CINCO_H_RANCH_PASSWORD,
  };
  const password = String(formData.get("password") ?? "").toLowerCase();
  let slug: string | null = null;
  for (const [s, p] of Object.entries(PASSWORDS)) {
    if (password === p.toLowerCase()) { slug = s; break; }
  }
  if (!slug) redirect("/?error=1");
  const jar = await cookies();
  jar.set("auth", slug, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect(`/${slug}`);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete("auth");
  redirect("/");
}