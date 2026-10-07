import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  DATABASE_URL: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  REDIS_URL: z.string().regex(/^rediss?:\/\//),
  AUCTION_WORKER_MODE: z.enum(['off', 'poll', 'redis']).optional(),
  ALLOW_LEGACY_ADMIN_KEY: z.enum(['true', 'false']).default('false'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]$/).default('15m'),
  JWT_REFRESH_TTL: z.string().regex(/^\d+[smhd]$/).default('30d'),
  DEFAULT_LOCALE: z.string().default('ar'),
  DEFAULT_CURRENCY: z.string().length(3).default('LYD'),
  CORS_ORIGINS: z.string().min(1),
  ADMIN_API_KEY: z.string().min(24).optional(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),
  BRANDING_STORAGE_DIR: z.string().min(1).optional(),
  MEDIA_STORAGE_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
  MEDIA_STORAGE_DIR: z.string().min(1).optional(),
  CLOUDINARY_URL: z.string().regex(/^cloudinary:\/\/[^:]+:[^@]+@[^/?#]+(?:\?.*)?$/).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  CLOUDINARY_FOLDER: z.string().min(1).default('libya-auctions'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
  RESALA_API_TOKEN: z.string().min(1).optional(),
  RESALA_BASE_URL: z.string().url().default('https://dev.resala.ly/api/v1'),
  RESALA_SERVICE_NAME: z.string().min(1).max(60).default('Carna'),
  RESALA_AUTOFILL_HASH: z.string().max(32).optional(),
  RESALA_OTP_SECRET: z.string().min(32).optional(),
});

const developmentMarkers = [
  'change-me',
  'replace-with',
  'local-development',
  'local-benghazi',
  'minioadmin',
];

export function validateEnvironment(input: Record<string, unknown>) {
  const environment = environmentSchema.parse(input);
  if (environment.MEDIA_STORAGE_PROVIDER === 'cloudinary' && !environment.CLOUDINARY_URL &&
      (!environment.CLOUDINARY_CLOUD_NAME || !environment.CLOUDINARY_API_KEY || !environment.CLOUDINARY_API_SECRET)) {
    throw new Error('Cloudinary storage requires CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  }
  if (environment.ALLOW_LEGACY_ADMIN_KEY === 'true' && !environment.ADMIN_API_KEY) {
    throw new Error('Legacy admin authentication requires ADMIN_API_KEY');
  }
  if (environment.NODE_ENV === 'production') {
    if (environment.ALLOW_LEGACY_ADMIN_KEY === 'true') throw new Error('Legacy admin authentication is disabled in production');
    if (environment.AUCTION_WORKER_MODE && environment.AUCTION_WORKER_MODE !== 'redis') throw new Error('Production auction worker must use Redis');
    const protectedValues = [
      environment.JWT_ACCESS_SECRET,
      environment.JWT_REFRESH_SECRET,
      environment.S3_ACCESS_KEY,
      environment.S3_SECRET_KEY,
      ...(environment.CLOUDINARY_API_SECRET ? [environment.CLOUDINARY_API_SECRET] : []),
      ...(environment.CLOUDINARY_URL ? [environment.CLOUDINARY_URL] : []),
      environment.PAYMENT_WEBHOOK_SECRET,
      ...(environment.RESALA_API_TOKEN ? [environment.RESALA_API_TOKEN] : []),
      ...(environment.RESALA_OTP_SECRET ? [environment.RESALA_OTP_SECRET] : []),
    ];
    const containsDevelopmentValue = protectedValues.some((value) =>
      developmentMarkers.some((marker) => value.toLowerCase().includes(marker)),
    );
    if (containsDevelopmentValue) {
      throw new Error('Production environment contains development credentials');
    }
    if (environment.DATABASE_URL.includes('127.0.0.1') || environment.DATABASE_URL.includes('localhost')) {
      throw new Error('Production DATABASE_URL cannot point to localhost');
    }
    if (environment.REDIS_URL.includes('127.0.0.1') || environment.REDIS_URL.includes('localhost')) {
      throw new Error('Production REDIS_URL cannot point to localhost');
    }
    if (environment.RESALA_API_TOKEN && !environment.RESALA_OTP_SECRET) {
      throw new Error('Production Resala OTP requires a dedicated RESALA_OTP_SECRET');
    }
    if (environment.RESALA_API_TOKEN && !input.RESALA_BASE_URL) {
      throw new Error('Production Resala OTP requires an explicit RESALA_BASE_URL');
    }
  }
  return environment;
}
