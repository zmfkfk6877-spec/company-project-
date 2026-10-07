import { z } from 'zod';
export const registration = z.object({
  eventId: z.string(),
  name: z.string().trim().min(2).max(60),
  department: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .transform((x) => x.replace(/\D/g, ''))
    .pipe(z.string().regex(/^01[016789]\d{7,8}$/)),
  consent: z.literal(true),
});
export const eventInput = z
  .object({
    title: z.string().trim().min(3).max(150),
    description: z.string().max(2000).default(''),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    durationSeconds: z.number().int().min(10).max(1800).default(300),
    correctPoints: z.number().int().min(1).max(10).default(2),
    wrongPoints: z.number().int().min(-10).max(0).default(-2),
    easyRatio: z.number().int().min(0).max(100).default(30),
    normalRatio: z.number().int().min(0).max(100).default(40),
    hardRatio: z.number().int().min(0).max(100).default(30),
    legitimateRatio: z.number().int().min(0).max(100).default(40),
    maxAttempts: z.number().int().min(1).max(5).default(1),
    retentionDays: z.number().int().min(1).max(365).default(30),
    departments: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
    allowCustomDepartment: z.boolean().default(true),
    explanationsPublished: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: '종료 시각은 시작 시각 이후여야 합니다.' })
  .refine((v) => v.easyRatio + v.normalRatio + v.hardRatio === 100, {
    message: '난이도 비율의 합은 100이어야 합니다.',
  });
export const questionInput = z.object({
  type: z.string().trim().min(1).max(100),
  difficulty: z.enum(['EASY', 'NORMAL', 'HARD']),
  subject: z.string().trim().min(1).max(300),
  senderName: z.string().min(1).max(150),
  senderEmail: z.string().email().max(254),
  recipient: z.string().max(150).default('임직원'),
  sentTime: z.string().max(100).default('오늘 09:00'),
  body: z.string().min(1).max(20000),
  links: z
    .array(z.object({ label: z.string().min(1).max(200), url: z.string().min(1).max(2000) }))
    .max(10)
    .default([]),
  attachments: z.array(z.string().min(1).max(200)).max(10).default([]),
  image: z
    .string()
    .regex(/^\/api\/media\/[a-f0-9]{32}\.png$/)
    .nullable()
    .optional(),
  expectedAnswer: z.enum(['NORMAL', 'PHISHING']),
  explanation: z.string().min(1).max(5000),
  risks: z.array(z.string().max(500)).max(20).default([]),
  active: z.boolean().default(true),
});
