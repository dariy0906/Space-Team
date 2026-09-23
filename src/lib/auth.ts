import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { Role } from '@prisma/client';
import { db } from './db';

const cookieName = 'aqtau_session';
const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
};
export async function createSession(id: string): Promise<void> {
  const token = await new SignJWT({ sub: id }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(key());
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
}
export async function deleteSession(): Promise<void> { (await cookies()).delete(cookieName); }
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    return await db.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true, role: true, lat: true, lng: true } });
  } catch { return null; }
}
export async function requireUser(role?: Role) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect(`/${user.role.toLowerCase()}`);
  return user;
}
