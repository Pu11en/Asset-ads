import { NextRequest, NextResponse } from 'next/server';

const BLOTATO_KEY = process.env.BLOTATO_API_KEY || '';
const BASE_URL = 'https://backend.blotato.com/v2';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blotatoId = searchParams.get('blotatoId');

  if (!blotatoId) {
    return NextResponse.json({ error: 'blotatoId required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${BASE_URL}/posts/${blotatoId}`, {
      headers: { 'blotato-api-key': BLOTATO_KEY },
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'unknown', error: await res.text() }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      status: data.status,
      publicUrl: data.publicUrl || null,
      errorMessage: data.errorMessage || null,
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'unknown', error: e.message }, { status: 500 });
  }
}
