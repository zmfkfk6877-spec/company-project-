import { db } from './db';
import { compareRank } from './engine';
import { decrypt, maskPhone } from './security';
import { settleExpired } from './quiz';
export async function resultRows(eventId: string, reveal = false) {
  await settleExpired(eventId);
  const attempts = await db.attempt.findMany({
    where: { eventId },
    include: { participant: true },
  });
  const finished = attempts.filter((a) => a.status === 'FINISHED');
  const best = new Map<string, (typeof finished)[number]>();
  for (const a of finished) {
    const b = best.get(a.participantId);
    if (!b || compareRank(a, b) < 0) best.set(a.participantId, a);
  }
  const ranked = [...best.values()].sort(compareRank);
  return ranked.map((a, i) => ({
    rank: i + 1,
    participantId: a.participantId,
    attemptId: a.id,
    name: a.participant.name,
    department: a.participant.department,
    phone: reveal
      ? decrypt(a.participant.phoneEncrypted)
      : maskPhone(decrypt(a.participant.phoneEncrypted)),
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    answeredCount: a.answeredCount,
    correctCount: a.correctCount,
    wrongCount: a.wrongCount,
    accuracy: Math.round(a.accuracy * 10) / 10,
    score: a.score,
    totalResponseMs: a.totalResponseMs,
    suspiciousCount: a.suspiciousCount,
  }));
}
export async function dashboard(eventId: string) {
  await settleExpired(eventId);
  const participants = await db.participant.count({ where: { eventId } });
  const a = await db.attempt.findMany({ where: { eventId } });
  const finished = a.filter((x) => x.status === 'FINISHED');
  const avg = (key: 'answeredCount' | 'correctCount' | 'wrongCount' | 'accuracy' | 'score') =>
    finished.length
      ? Math.round((finished.reduce((s, x) => s + x[key], 0) / finished.length) * 10) / 10
      : 0;
  return {
    registered: participants,
    started: a.length,
    active: a.filter((x) => x.status === 'ACTIVE').length,
    finished: finished.length,
    averageAnswered: avg('answeredCount'),
    averageCorrect: avg('correctCount'),
    averageWrong: avg('wrongCount'),
    averageAccuracy: avg('accuracy'),
    averageScore: avg('score'),
  };
}
