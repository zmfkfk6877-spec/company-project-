import bcrypt from 'bcryptjs';
import { db } from '../lib/db';
async function main() {
  const username = process.env.ADMIN_USERNAME,
    password = process.env.ADMIN_INITIAL_PASSWORD,
    role = process.env.ADMIN_ROLE || 'SUPERADMIN';
  if (
    !username ||
    !password ||
    password.length < 12 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  )
    throw new Error(
      'Set ADMIN_USERNAME and strong ADMIN_INITIAL_PASSWORD (12+ characters, letters, digits, symbols).',
    );
  if (!['SUPERADMIN', 'OPERATOR', 'VIEWER'].includes(role)) throw new Error('Invalid role');
  if (await db.admin.findUnique({ where: { username } })) {
    console.log('Admin exists; password preserved.');
    return;
  }
  await db.admin.create({
    data: { username, passwordHash: await bcrypt.hash(password, 12), role },
  });
  console.log('Admin created; password not logged.');
}
main().finally(() => db.$disconnect());
