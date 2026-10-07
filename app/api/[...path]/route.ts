import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { db } from '@/lib/db';
import {
  ApiError,
  audit,
  checkOrigin,
  clientIp,
  createSession,
  csvCell,
  decrypt,
  encrypt,
  hash,
  identity,
  maskPhone,
  requireAdmin,
  session,
  setSession,
  throttle,
} from '@/lib/security';
import { eventInput, questionInput, registration } from '@/lib/validation';
import { eventOpen } from '@/lib/engine';
import { current, personalResult, reviews, startAttempt, submit } from '@/lib/quiz';
import { dashboard, resultRows } from '@/lib/admin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function body(r: NextRequest) {
  if (Number(r.headers.get('content-length') || 0) > 100000)
    throw new ApiError(413, '요청이 너무 큽니다.');
  const raw = await r.text();
  if (raw.length > 100000) throw new ApiError(413, '요청이 너무 큽니다.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, '입력 내용을 확인해주세요.');
  }
}
async function route(r: NextRequest) {
  const parts = r.nextUrl.pathname.split('/').filter(Boolean).slice(1),
    method = r.method;
  const key = parts.join('/');
  if (method !== 'GET') checkOrigin(r);
  if (key === 'events' && method === 'GET') {
    const events = await db.event.findMany({
      where: { active: true },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        durationSeconds: true,
        correctPoints: true,
        wrongPoints: true,
        maxAttempts: true,
        retentionDays: true,
        departments: true,
        allowCustomDepartment: true,
      },
    });
    return json(events);
  }
  if (key === 'register' && method === 'POST') {
    await throttle('register:' + clientIp(r), 300);
    const data = registration.parse(await body(r));
    const event = await db.event.findUnique({ where: { id: data.eventId } });
    if (!event) throw new ApiError(404, '대회를 찾을 수 없습니다.');
    const closed = eventOpen(event);
    if (closed) throw new ApiError(409, closed);
    if (!event.allowCustomDepartment && !event.departments.includes(data.department))
      throw new ApiError(400, '등록된 부서를 선택해주세요.');
    const identityHash = identity(data.name, data.phone);
    const p = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.eventId + identityHash}))`;
      const found = await tx.participant.findUnique({
        where: { eventId_identityHash: { eventId: data.eventId, identityHash } },
        include: { attempts: true },
      });
      if (found) {
        if (
          found.attempts.filter((a) => a.status === 'FINISHED' || a.expiresAt <= new Date())
            .length >= event.maxAttempts
        )
          throw new ApiError(409, '이미 참여가 완료된 대회입니다.');
        return found;
      }
      return tx.participant.create({
        data: {
          eventId: event.id,
          name: data.name,
          department: data.department,
          phoneEncrypted: encrypt(data.phone),
          identityHash,
        },
      });
    });
    const token = await createSession('participant', p.id);
    const res = json({ registered: true });
    setSession(res, 'participant', token);
    return res;
  }
  if (['attempt', 'attempt/start', 'attempt/answer', 'result', 'review'].includes(key)) {
    const s = await session(r, 'participant');
    const id = s.participantId!;
    if (key === 'attempt' && method === 'GET') return json(await current(id));
    if (key === 'attempt/start' && method === 'POST') return json(await startAttempt(id));
    if (key === 'attempt/answer' && method === 'POST') {
      await throttle('answer:' + id, 150);
      const data = z
        .object({ assignmentId: z.string(), selectedAnswer: z.enum(['NORMAL', 'PHISHING']) })
        .parse(await body(r));
      return json(await submit(id, data.assignmentId, data.selectedAnswer));
    }
    if (key === 'result' && method === 'GET') return json(await personalResult(id));
    if (key === 'review' && method === 'GET') return json(await reviews(id));
  }
  if (parts[0] === 'media' && method === 'GET') {
    const s = await (async () => {
      try {
        return await session(r, 'participant');
      } catch {
        return await session(r, 'admin');
      }
    })();
    void s;
    const filename = parts[1];
    if (!/^[a-f0-9]{32}\.png$/.test(filename))
      throw new ApiError(404, '이미지를 찾을 수 없습니다.');
    try {
      const bytes = await readFile(
        path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), '.local/uploads'), filename),
      );
      return new NextResponse(bytes, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
      });
    } catch {
      throw new ApiError(404, '이미지를 찾을 수 없습니다.');
    }
  }
  if (key === 'admin/login' && method === 'POST') {
    const data = z
      .object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) })
      .parse(await body(r));
    try {
      await throttle('login-ip:' + clientIp(r), 20, 900);
      await throttle('login-user:' + hash(data.username), 5, 900);
    } catch (e) {
      await audit(r, data.username, 'LOGIN_FAILED', 'rate-limit', false);
      throw e;
    }
    const admin = await db.admin.findUnique({ where: { username: data.username } });
    const valid = await bcrypt.compare(
      data.password,
      admin?.passwordHash || '$2b$12$GkZj.MtdCVEMpkvxOHGvkeLBWuNDJWcPTIqnUDVeLeCfFKvyAFhyG',
    );
    if (!admin || !valid) {
      await audit(r, data.username, 'LOGIN_FAILED', 'admin', false);
      throw new ApiError(401, '아이디 또는 비밀번호를 확인해주세요.');
    }
    const allowed = process.env.ADMIN_ALLOWED_IPS?.split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (allowed?.length && !allowed.includes(clientIp(r)))
      throw new ApiError(403, '허용되지 않은 IP입니다.');
    const token = await createSession('admin', admin.id);
    await audit(r, admin.username, 'LOGIN', 'admin');
    const res = json({ username: admin.username, role: admin.role });
    setSession(res, 'admin', token);
    return res;
  }
  if (parts[0] === 'admin') {
    const privacy =
      key.endsWith('/export') ||
      key.endsWith('/purge') ||
      (method === 'DELETE' && parts[1] === 'participants') ||
      key === 'admin/settings';
    const admin = await requireAdmin(r, method !== 'GET', privacy);
    const actor = admin.username;
    if (key === 'admin/me' && method === 'GET') return json({ username: actor, role: admin.role });
    if (key === 'admin/logout' && method === 'POST') {
      const token = r.cookies.get('pq_admin')!.value;
      await db.session.deleteMany({ where: { tokenHash: hash(token) } });
      const res = json({ ok: true });
      res.cookies.delete('pq_admin');
      return res;
    }
    if (key === 'admin/settings') {
      if (method === 'GET')
        return json({
          username: actor,
          role: admin.role,
          ipRestrictionEnabled: !!process.env.ADMIN_ALLOWED_IPS,
          sessionMinutes: 30,
        });
      if (method === 'PATCH') {
        const data = z
          .object({
            currentPassword: z.string(),
            newPassword: z
              .string()
              .min(12)
              .max(128)
              .regex(/[A-Za-z]/)
              .regex(/\d/)
              .regex(/[^A-Za-z0-9]/),
          })
          .parse(await body(r));
        if (!(await bcrypt.compare(data.currentPassword, admin.passwordHash)))
          throw new ApiError(400, '현재 비밀번호를 확인해주세요.');
        await db.admin.update({
          where: { id: admin.id },
          data: { passwordHash: await bcrypt.hash(data.newPassword, 12) },
        });
        await db.session.deleteMany({ where: { adminId: admin.id } });
        await audit(r, actor, 'SETTINGS_CHANGE', 'password');
        const res = json({ ok: true });
        res.cookies.delete('pq_admin');
        return res;
      }
    }
    if (key === 'admin/audit' && method === 'GET')
      return json(await db.auditLog.findMany({ take: 500, orderBy: { createdAt: 'desc' } }));
    if (key === 'admin/upload' && method === 'POST') {
      if (Number(r.headers.get('content-length') || 0) > 3 * 1024 * 1024)
        throw new ApiError(413, '이미지는 2MB 이하로 업로드해주세요.');
      const form = await r.formData();
      const file = form.get('file');
      if (
        !(file instanceof File) ||
        file.size > 2 * 1024 * 1024 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw new ApiError(400, '2MB 이하 PNG/JPEG/WebP만 지원합니다.');
      const name = randomBytes(16).toString('hex') + '.png';
      const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), '.local/uploads');
      await mkdir(dir, { recursive: true });
      let bytes: Buffer;
      try {
        bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000 })
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
      } catch {
        throw new ApiError(400, '올바른 이미지를 선택해주세요.');
      }
      await writeFile(path.join(dir, name), bytes);
      await audit(r, actor, 'IMAGE_UPLOAD', name);
      return json({ image: '/api/media/' + name });
    }
    if (parts[1] === 'events') {
      const id = parts[2];
      if (!id) {
        if (method === 'GET')
          return json(await db.event.findMany({ orderBy: { createdAt: 'desc' } }));
        if (method === 'POST') {
          const data = eventInput.parse(await body(r));
          const event = await db.event.create({ data });
          await audit(r, actor, 'EVENT_CREATE', event.id);
          return json(event, 201);
        }
      } else if (parts.length === 3) {
        if (method === 'PATCH') {
          const data = eventInput.parse(await body(r));
          const event = await db.event.update({ where: { id }, data });
          await audit(r, actor, 'EVENT_UPDATE', id);
          return json(event);
        }
        if (method === 'DELETE') {
          await requireAdmin(r, true, true);
          await db.event.delete({ where: { id } });
          await audit(r, actor, 'EVENT_DELETE', id);
          return json({ ok: true });
        }
      } else {
        if (parts[3] === 'dashboard' && method === 'GET') return json(await dashboard(id));
        if (parts[3] === 'results' && method === 'GET') {
          await audit(r, actor, 'RESULT_VIEW', id);
          const search = r.nextUrl.searchParams.get('search')?.toLowerCase();
          const data = await resultRows(id, !!search);
          return json(
            data
              .filter(
                (x) =>
                  !search ||
                  [x.name, x.department, x.phone].some((v) => v.toLowerCase().includes(search)),
              )
              .map((x) => ({ ...x, phone: search ? maskPhone(x.phone) : x.phone })),
          );
        }
        if (parts[3] === 'participants' && method === 'GET') {
          await audit(r, actor, 'PARTICIPANT_VIEW', id);
          const ps = await db.participant.findMany({
            where: { eventId: id },
            include: { attempts: { orderBy: { startedAt: 'desc' }, take: 1 } },
            orderBy: { createdAt: 'desc' },
          });
          const search = r.nextUrl.searchParams.get('search')?.toLowerCase();
          return json(
            ps
              .filter(
                (p) =>
                  !search ||
                  [p.name, p.department, decrypt(p.phoneEncrypted)].some((v) =>
                    v.toLowerCase().includes(search),
                  ),
              )
              .map((p) => ({
                id: p.id,
                name: p.name,
                department: p.department,
                phone: maskPhone(decrypt(p.phoneEncrypted)),
                state: p.attempts[0]?.status || 'REGISTERED',
                createdAt: p.createdAt,
              })),
          );
        }
        if (parts[3] === 'export' && method === 'GET') {
          const rows = await resultRows(id, true);
          await audit(r, actor, 'RESULT_DOWNLOAD', id);
          const header = [
            '순위',
            '부서',
            '이름',
            '휴대전화번호',
            '응시 시작시간',
            '응시 종료시간',
            '응답',
            '정답',
            '오답',
            '정확도',
            '점수',
            '응답시간(ms)',
            '이상응답',
          ];
          const data = rows.map((x) => [
            x.rank,
            x.department,
            x.name,
            x.phone,
            x.startedAt.toISOString(),
            x.finishedAt?.toISOString(),
            x.answeredCount,
            x.correctCount,
            x.wrongCount,
            x.accuracy,
            x.score,
            x.totalResponseMs,
            x.suspiciousCount,
          ]);
          return new NextResponse(
            '\uFEFF' + [header, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n'),
            {
              headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="quiz-results.csv"',
                'Cache-Control': 'no-store',
              },
            },
          );
        }
        if (parts[3] === 'purge' && method === 'POST') {
          await db.participant.deleteMany({ where: { eventId: id } });
          await audit(r, actor, 'PARTICIPANTS_DELETE_ALL', id);
          return json({ ok: true });
        }
      }
    }
    if (parts[1] === 'participants' && parts[2]) {
      const id = parts[2];
      if (parts[3] === 'reset' && method === 'POST') {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Participant" WHERE "id"=${id} FOR UPDATE`;
          await tx.attempt.deleteMany({ where: { participantId: id } });
          await tx.session.deleteMany({ where: { participantId: id } });
        });
        await audit(r, actor, 'ATTEMPT_RESET', id);
        return json({ ok: true });
      }
      if (parts.length === 3 && method === 'DELETE') {
        await db.participant.delete({ where: { id } });
        await audit(r, actor, 'PARTICIPANT_DELETE', id);
        return json({ ok: true });
      }
    }
    if (parts[1] === 'questions') {
      const id = parts[2];
      if (!id) {
        if (method === 'GET') {
          await audit(r, actor, 'QUESTION_VIEW', 'bank');
          return json(await db.question.findMany({ orderBy: { createdAt: 'desc' } }));
        }
        if (method === 'POST') {
          const data = questionInput.parse(await body(r));
          const q = await db.question.create({
            data: { ...data, links: data.links as Prisma.InputJsonValue },
          });
          await audit(r, actor, 'QUESTION_CREATE', q.id);
          return json(q, 201);
        }
      } else {
        if (parts[3] === 'copy' && method === 'POST') {
          const q = await db.question.findUniqueOrThrow({ where: { id } });
          const { id: old, createdAt, updatedAt, ...rest } = q;
          void old;
          void createdAt;
          void updatedAt;
          const copy = await db.question.create({
            data: {
              ...rest,
              subject: rest.subject + ' (복사)',
              links: rest.links as Prisma.InputJsonValue,
            },
          });
          await audit(r, actor, 'QUESTION_COPY', copy.id);
          return json(copy, 201);
        }
        if (method === 'PATCH') {
          const data = questionInput.parse(await body(r));
          const q = await db.question.update({
            where: { id },
            data: { ...data, links: data.links as Prisma.InputJsonValue },
          });
          await audit(r, actor, 'QUESTION_UPDATE', id);
          return json(q);
        }
        if (method === 'DELETE') {
          await db.question.delete({ where: { id } });
          await audit(r, actor, 'QUESTION_DELETE', id);
          return json({ ok: true });
        }
      }
    }
  }
  throw new ApiError(404, '요청을 찾을 수 없습니다.');
}
async function handler(r: NextRequest) {
  try {
    return await route(r);
  } catch (error) {
    if (error instanceof ApiError) return json({ message: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json({ message: error.issues[0]?.message || '입력 내용을 확인해주세요.' }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
      return json({ message: '대상을 찾을 수 없습니다.' }, 404);
    console.error('API failure', {
      path: r.nextUrl.pathname,
      error: error instanceof Error ? error.name : 'Unknown',
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return json({ message: '일시적인 오류가 발생했습니다. 다시 시도해주세요.' }, 500);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
