import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Opt out of static generation - all handlers connect to MongoDB at request time.
export const dynamic = 'force-dynamic';


export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  return NextResponse.json({ success: true }, { status: 200 });
}