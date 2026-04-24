"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function resolveBrand(password: string): string | null {
  const lowered = password.toLowerCase();
  const ISLAND_SPLASH_PASSWORD = process.env.ISLAND_SPLASH_PASSWORD;
  const CINCO_H_RANCH_PASSWORD = process.env.CINCO_H_RANCH_PASSWORD;
  if (!ISLAND_SPLASH_PASSWORD || !CINCO_H_RANCH_PASSWORD) return null;
  const PASSWORDS: Record<string, string> = {
    "island-splash": ISLAND_SPLASH_PASSWORD,
    "cinco-h-ranch": CINCO_H_RANCH_PASSWORD,
  };
  for (const [slug, expected] of Object.entries(PASSWORDS)) {
    if (lowered === expected.toLowerCase()) return slug;
  }
  return null;
}

export async function signIn(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const slug = resolveBrand(password);

  if (!slug) {
    redirect("/?error=1");
  }

  const jar = await cookies();
  jar.set("auth", slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(`/${slug}`);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete("auth");
  redirect("/");
}
