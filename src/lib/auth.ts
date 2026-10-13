import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '../db/types';

const SECRET_KEY = Buffer.from(
  process.env.JWT_SECRET || 'super-secret-jwt-token-for-theroadproblem-development-test-suite-32chars',
  'utf-8'
);

export interface SessionClaims {
  sub: string;
  role: UserRole;
  email?: string;
  display_name?: string;
  locale?: string;
}

export async function createSessionToken(claims: SessionClaims, expiresIn = '7d'): Promise<string> {
  return new SignJWT({
    role: claims.role,
    email: claims.email,
    display_name: claims.display_name,
    locale: claims.locale || 'en',
    app_metadata: { role: claims.role },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return {
      sub: payload.sub as string,
      role: (payload.role as UserRole) || 'citizen',
      email: payload.email as string | undefined,
      display_name: payload.display_name as string | undefined,
      locale: payload.locale as string | undefined,
    };
  } catch {
    return null;
  }
}
