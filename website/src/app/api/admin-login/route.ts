import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const password = String(formData.get('password') ?? '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.redirect(new URL(`/admin/login?error=${adminPassword ? '1' : 'env'}`, req.url));
  }

  const res = NextResponse.redirect(new URL('/admin', req.url));
  res.cookies.set('admin', 'true', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
