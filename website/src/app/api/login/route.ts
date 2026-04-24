import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const password = String(formData.get('password') ?? '').trim().toLowerCase();

  const islandSplash = process.env.ISLAND_SPLASH_PASSWORD?.trim().toLowerCase();
  const cincoHRanch = process.env.CINCO_H_RANCH_PASSWORD?.trim().toLowerCase();

  if (!islandSplash || !cincoHRanch) {
    return NextResponse.redirect(new URL('/?error=env', req.url));
  }

  const slug =
    password === islandSplash
      ? 'island-splash'
      : password === cincoHRanch
        ? 'cinco-h-ranch'
        : null;

  if (!slug) {
    return NextResponse.redirect(new URL('/?error=1', req.url));
  }

  const res = NextResponse.redirect(new URL(`/${slug}`, req.url));
  res.cookies.set('auth', slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
