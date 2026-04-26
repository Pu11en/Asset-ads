import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const password = String(formData.get('password') ?? '').trim();
  const viewerPassword = process.env.VIEWER_PASSWORD?.trim() || 'islandsplash';

  if (password !== viewerPassword) {
    return NextResponse.redirect(new URL('/viewer?error=1', req.url));
  }

  const res = NextResponse.redirect(new URL('/viewer', req.url));
  res.cookies.set('viewer_auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
