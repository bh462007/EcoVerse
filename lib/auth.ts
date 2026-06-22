import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey =
  process.env.JWT_SECRET || 'fallback_secret_for_development_only';
const key = new TextEncoder().encode(secretKey);

export async function signToken(payload: { email: string; userId?: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return payload as { email: string; userId?: string };
  } catch (error) {
    return null; // Invalid or expired token
  }
}

// Signs a JWT for the given identity and sets it as the HttpOnly auth_token
// cookie. Centralizes the cookie options (httpOnly, secure, sameSite, maxAge,
// path) so all auth entry points (Google, email/password signin and signup)
// stay consistent.
export async function setAuthCookie(email: string, userId: string) {
  const token = await signToken({ email, userId });

  const cookieStore = await cookies();
  cookieStore.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}
