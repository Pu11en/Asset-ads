import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/viewer', req.url));
  res.cookies.set('viewer_auth', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
