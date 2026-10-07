import { db } from '../lib/db';
async function main() {
  const now = new Date();
  const events = await db.event.findMany();
  for (const e of events) {
    if (+e.endsAt + e.retentionDays * 86400000 <= +now) {
      await db.$transaction(async (tx) => {
        const count = await tx.participant.deleteMany({ where: { eventId: e.id } });
        if (count.count)
          await tx.auditLog.create({
            data: {
              actor: 'system-retention',
              action: 'RETENTION_PURGE',
              target: e.id,
              ip: 'local',
              success: true,
            },
          });
      });
    }
  }
  await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.rateLimit.deleteMany({ where: { resetAt: { lte: now } } });
  console.log('Retention and expired session cleanup complete.');
}
main().finally(() => db.$disconnect());
