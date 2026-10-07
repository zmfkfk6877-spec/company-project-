import { Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError } from './security';
import { assignPool, compareRank, eventOpen, publicQuestion } from './engine';
type Tx = Prisma.TransactionClient;
export async function settleExpired(eventId?: string) {
  const now = new Date();
  await db.attempt.updateMany({
    where: {
      status: 'ACTIVE',
      ...(eventId ? { eventId } : {}),
      OR: [
        { expiresAt: { lte: now } },
        { event: { endsAt: { lte: now } } },
        { event: { active: false } },
      ],
    },
    data: { status: 'FINISHED', finishedAt: now },
  });
}
async function view(tx: Tx, attemptId: string) {
  const a = await tx.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { event: true },
  });
  const now = new Date();
  if (a.status === 'FINISHED') return { state: 'FINISHED', serverNow: now.toISOString() };
  if (now >= a.expiresAt || now >= a.event.endsAt || !a.event.active) {
    await tx.attempt.update({ where: { id: a.id }, data: { status: 'FINISHED', finishedAt: now } });
    return { state: 'FINISHED', serverNow: now.toISOString() };
  }
  const q = await tx.assignedQuestion.findUnique({
    where: { attemptId_position: { attemptId: a.id, position: a.answeredCount } },
  });
  if (!q) {
    await tx.attempt.update({ where: { id: a.id }, data: { status: 'FINISHED', finishedAt: now } });
    return { state: 'FINISHED', serverNow: now.toISOString() };
  }
  if (!q.shownAt) await tx.assignedQuestion.update({ where: { id: q.id }, data: { shownAt: now } });
  return {
    state: 'ACTIVE',
    expiresAt: a.expiresAt.toISOString(),
    serverNow: now.toISOString(),
    answeredCount: a.answeredCount,
    question: publicQuestion(q.snapshot as Record<string, unknown>, q.id),
  };
}
export async function startAttempt(participantId: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Participant" WHERE "id"=${participantId} FOR UPDATE`;
      const p = await tx.participant.findUniqueOrThrow({
        where: { id: participantId },
        include: { event: true, attempts: { orderBy: { startedAt: 'desc' } } },
      });
      const active = p.attempts.find((a) => a.status === 'ACTIVE');
      if (active) {
        await tx.$queryRaw`SELECT "id" FROM "Attempt" WHERE "id"=${active.id} FOR UPDATE`;
        return view(tx, active.id);
      }
      const closed = eventOpen(p.event);
      if (closed) throw new ApiError(409, closed);
      if (p.attempts.length >= p.event.maxAttempts)
        throw new ApiError(409, '이미 참여가 완료된 대회입니다.');
      const pool = await tx.question.findMany({ where: { active: true } });
      const ordered = assignPool(
        pool,
        [p.event.easyRatio, p.event.normalRatio, p.event.hardRatio],
        p.event.legitimateRatio,
      );
      if (ordered.length < 10)
        throw new ApiError(409, '설정된 비율에 맞는 문제가 부족합니다. 관리자에게 문의해주세요.');
      const now = new Date();
      const a = await tx.attempt.create({
        data: {
          participantId,
          eventId: p.eventId,
          startedAt: now,
          expiresAt: new Date(Math.min(+now + p.event.durationSeconds * 1000, +p.event.endsAt)),
          correctPoints: p.event.correctPoints,
          wrongPoints: p.event.wrongPoints,
        },
      });
      await tx.assignedQuestion.createMany({
        data: ordered.map((q, position) => ({
          attemptId: a.id,
          questionId: q.id,
          position,
          snapshot: JSON.parse(JSON.stringify(q)),
        })),
      });
      return view(tx, a.id);
    },
    { timeout: 20000 },
  );
}
export async function current(participantId: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.attempt.findFirst({
      where: { participantId },
      orderBy: { startedAt: 'desc' },
    });
    if (!a) return { state: 'READY', serverNow: new Date().toISOString() };
    await tx.$queryRaw`SELECT "id" FROM "Attempt" WHERE "id"=${a.id} FOR UPDATE`;
    return view(tx, a.id);
  });
}
export async function submit(participantId: string, assignmentId: string, selectedAnswer: string) {
  return db.$transaction(async (tx) => {
    const attempt = await tx.attempt.findFirst({
      where: { participantId },
      orderBy: { startedAt: 'desc' },
    });
    if (!attempt) throw new ApiError(409, '먼저 응시를 시작해주세요.');
    await tx.$queryRaw`SELECT "id" FROM "Attempt" WHERE "id"=${attempt.id} FOR UPDATE`;
    const a = await tx.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
      include: { event: true },
    });
    const now = new Date();
    if (a.status !== 'ACTIVE' || now >= a.expiresAt || now >= a.event.endsAt || !a.event.active)
      return view(tx, a.id);
    const q = await tx.assignedQuestion.findUnique({
      where: { id: assignmentId },
      include: { answer: true },
    });
    if (!q || q.attemptId !== a.id) throw new ApiError(409, '배정되지 않은 문제입니다.');
    if (q.answer) return view(tx, a.id);
    if (q.position !== a.answeredCount || !q.shownAt)
      throw new ApiError(409, '현재 문제에만 답변할 수 있습니다.');
    const expectedAnswer = (q.snapshot as Record<string, unknown>).expectedAnswer as string;
    const correct = expectedAnswer === selectedAnswer;
    const responseTime = Math.max(0, +now - +q.shownAt);
    await tx.answer.create({
      data: {
        attemptId: a.id,
        assignedId: q.id,
        selectedAnswer,
        expectedAnswer,
        correct,
        questionStartedAt: q.shownAt,
        answeredAt: now,
        responseTime,
      },
    });
    const n = a.answeredCount + 1,
      c = a.correctCount + (correct ? 1 : 0),
      w = n - c;
    await tx.attempt.update({
      where: { id: a.id },
      data: {
        answeredCount: n,
        correctCount: c,
        wrongCount: w,
        score: c * a.correctPoints + w * a.wrongPoints,
        accuracy: (c / n) * 100,
        totalResponseMs: a.totalResponseMs + responseTime,
        suspiciousCount: a.suspiciousCount + (responseTime < 800 ? 1 : 0),
      },
    });
    return view(tx, a.id);
  });
}
export async function personalResult(participantId: string) {
  await current(participantId);
  const a = await db.attempt.findFirst({
    where: { participantId },
    orderBy: { startedAt: 'desc' },
    include: { event: true },
  });
  if (!a || a.status !== 'FINISHED') throw new ApiError(409, '응시 종료 후 확인할 수 있습니다.');
  await settleExpired(a.eventId);
  const all = await db.attempt.findMany({ where: { eventId: a.eventId, status: 'FINISHED' } });
  const best = new Map<string, typeof a>();
  for (const x of all) {
    const previous = best.get(x.participantId);
    if (!previous || compareRank(x, previous) < 0) best.set(x.participantId, x as typeof a);
  }
  const ranking = [...best.values()].sort(compareRank);
  const ranked = best.get(participantId)!;
  const rank = ranking.findIndex((x) => x.id === ranked.id) + 1;
  const final = Date.now() >= +a.event.endsAt;
  return {
    eventId: a.eventId,
    canRetry:
      !eventOpen(a.event) &&
      (await db.attempt.count({ where: { participantId } })) < a.event.maxAttempts,
    participantCount: ranking.length,
    rank,
    rankStatus: final ? 'FINAL' : 'CURRENT',
    answeredCount: a.answeredCount,
    correctCount: a.correctCount,
    wrongCount: a.wrongCount,
    accuracy: Math.round(a.accuracy * 10) / 10,
    score: a.score,
    reviewAvailable: final && a.event.explanationsPublished,
  };
}
export async function reviews(participantId: string) {
  const result = await personalResult(participantId);
  if (!result.reviewAvailable)
    throw new ApiError(403, '대회 종료 후 관리자가 해설을 공개하면 확인할 수 있습니다.');
  const a = await db.attempt.findFirstOrThrow({
    where: { participantId },
    orderBy: { startedAt: 'desc' },
  });
  const answers = await db.answer.findMany({
    where: { attemptId: a.id },
    include: { assigned: true },
    orderBy: { answeredAt: 'asc' },
  });
  return answers.map((x) => ({
    question: publicQuestion(x.assigned.snapshot as Record<string, unknown>, x.assignedId),
    selectedAnswer: x.selectedAnswer,
    expectedAnswer: x.expectedAnswer,
    explanation: (x.assigned.snapshot as Record<string, unknown>).explanation,
    risks: (x.assigned.snapshot as Record<string, unknown>).risks,
  }));
}
