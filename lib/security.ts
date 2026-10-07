import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function key() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new Error('ENCRYPTION_KEY must be 32-byte hex');
  return Buffer.from(value, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', key(), iv);
  return [
    iv.toString('hex'),
    Buffer.concat([c.update(value, 'utf8'), c.final()]).toString('hex'),
    c.getAuthTag().toString('hex'),
  ].join('.');
}
export function decrypt(value: string) {
  const [iv, data, tag] = value.split('.');
  const c = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
  c.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([c.update(Buffer.from(data, 'hex')), c.final()]).toString('utf8');
}
export function identity(name: string, phone: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be >=32 characters');
  return createHmac('sha256', secret)
    .update(name.normalize('NFKC').trim().toLocaleLowerCase() + '|' + phone)
    .digest('hex');
}
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const clientIp = (r: NextRequest) =>
  process.env.TRUST_PROXY === 'true' ? r.headers.get('x-real-ip') || 'unknown' : 'untrusted-client';
export function checkOrigin(r: NextRequest) {
  const origin = r.headers.get('origin');
  const expected = process.env.PUBLIC_URL || r.nextUrl.origin;
  if (origin !== new URL(expected).origin) throw new ApiError(403, '허용되지 않은 요청입니다.');
}
export async function throttle(keyName: string, limit: number, seconds = 60) {
  const now = new Date();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","resetAt") VALUES (${keyName},1,${new Date(+now + seconds * 1000)}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count"+1 END,"resetAt"=CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${new Date(+now + seconds * 1000)} ELSE "RateLimit"."resetAt" END RETURNING "count"`;
  if (rows[0].count > limit) throw new ApiError(429, '요청이 많습니다. 잠시 후 다시 시도해주세요.');
}
export async function audit(
  r: NextRequest,
  actor: string,
  action: string,
  target: string,
  success = true,
) {
  await db.auditLog.create({ data: { actor, action, target, ip: clientIp(r), success } });
}
export async function createSession(kind: 'admin' | 'participant', id: string) {
  const token = randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      tokenHash: hash(token),
      [kind + 'Id']: id,
      expiresAt: new Date(Date.now() + (kind === 'admin' ? 30 * 60 : 24 * 3600) * 1000),
    },
  });
  return token;
}
export function setSession(res: NextResponse, kind: 'admin' | 'participant', token: string) {
  res.cookies.set(kind === 'admin' ? 'pq_admin' : 'pq_participant', token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict',
    path: '/',
    maxAge: kind === 'admin' ? 1800 : 86400,
  });
}
export async function session(r: NextRequest, kind: 'admin' | 'participant') {
  const token = r.cookies.get(kind === 'admin' ? 'pq_admin' : 'pq_participant')?.value;
  if (!token) throw new ApiError(401, '로그인이 필요합니다.');
  const s = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { admin: true, participant: true },
  });
  if (!s || s.expiresAt <= new Date() || !s[kind])
    throw new ApiError(401, '세션이 만료되었습니다. 다시 접속해주세요.');
  return s;
}
export async function requireAdmin(r: NextRequest, write = false, privacy = false) {
  const s = await session(r, 'admin');
  const admin = s.admin!;
  const allowed = process.env.ADMIN_ALLOWED_IPS?.split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowed?.length && !allowed.includes(clientIp(r)))
    throw new ApiError(403, '관리자 접근이 허용되지 않은 IP입니다.');
  if ((write && admin.role === 'VIEWER') || (privacy && admin.role !== 'SUPERADMIN'))
    throw new ApiError(403, '권한이 없습니다.');
  return admin;
}
export function maskPhone(phone: string) {
  return phone.slice(0, 3) + '-' + phone.slice(3, 5) + '**-' + phone.slice(7, 9) + '**';
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
