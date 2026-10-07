import { ConflictException, HttpException, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeResalaPhone, ResalaClient } from './resala.client';
import { RESALA_CLIENT } from './resala.tokens';

const otpLifetimeMs = 5 * 60_000;
const resendCooldownMs = 60_000;
const maxAttempts = 5;

@Injectable()
export class PhoneOtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RESALA_CLIENT) private readonly resala: ResalaClient,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(phone: string) {
    const number = normalizeResalaPhone(phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.deletedAt || ['Banned', 'Suspended', 'Archived'].includes(user.status)) {
      throw new UnauthorizedException('otp.account_unavailable');
    }
    if (user.phoneVerifiedAt) throw new ConflictException('otp.already_verified');
    this.resala.ensureConfigured();

    const now = new Date();
    const existing = await this.prisma.phoneOtpChallenge.findUnique({ where: { phone: number } });
    let version = 0;
    if (existing) {
      if (existing.lastSentAt.getTime() + resendCooldownMs > now.getTime()) throw new HttpException('otp.resend_cooldown', 429);
      const reserved = await this.prisma.phoneOtpChallenge.updateMany({
        where: { phone: number, version: existing.version, lastSentAt: { lte: new Date(now.getTime() - resendCooldownMs) } },
        data: { pinHash: null, expiresAt: now, attempts: 0, lastSentAt: now, version: { increment: 1 } },
      });
      if (!reserved.count) throw new HttpException('otp.resend_cooldown', 429);
      version = existing.version + 1;
    } else {
      try {
        await this.prisma.phoneOtpChallenge.create({ data: { phone: number, pinHash: null, expiresAt: now, lastSentAt: now } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new HttpException('otp.resend_cooldown', 429);
        throw error;
      }
    }

    // Keep the cooldown reservation on an uncertain network failure: retrying POST could send a duplicate SMS.
    const sent = await this.resala.sendPin(number);
    if (!/^\d{4,6}$/.test(sent.pin)) throw new ConflictException('otp.provider_response_invalid');
    if (sent.code !== '218' || sent.number !== number.slice(3)) throw new ConflictException('otp.provider_phone_mismatch');
    const expiresAt = new Date(Date.now() + otpLifetimeMs);
    const stored = await this.prisma.phoneOtpChallenge.updateMany({
      where: { phone: number, version, lastSentAt: now },
      data: { pinHash: this.pinHash(number, sent.pin), expiresAt, version: { increment: 1 } },
    });
    if (!stored.count) throw new ConflictException('otp.concurrent_request');
    return { sent: true, expiresAt, resendAfterSeconds: 60 };
  }

  async verifyOtp(phone: string, input: string) {
    const number = normalizeResalaPhone(phone);
    const now = new Date();
    const challenge = await this.prisma.phoneOtpChallenge.findUnique({ where: { phone: number } });
    if (!challenge?.pinHash || challenge.expiresAt <= now) throw new UnauthorizedException('otp.invalid_or_expired');
    if (challenge.attempts >= maxAttempts) throw new HttpException('otp.too_many_attempts', 429);
    const expected = Buffer.from(challenge.pinHash, 'hex');
    const candidate = Buffer.from(this.pinHash(number, input), 'hex');
    if (expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
      const changed = await this.prisma.phoneOtpChallenge.updateMany({
        where: { phone: number, version: challenge.version, attempts: { lt: maxAttempts }, expiresAt: { gt: now } },
        data: { attempts: { increment: 1 }, version: { increment: 1 } },
      });
      if (!changed.count) throw new ConflictException('otp.concurrent_attempt');
      throw new UnauthorizedException('otp.invalid_code');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.phoneOtpChallenge.deleteMany({ where: { phone: number, version: challenge.version,
        attempts: { lt: maxAttempts }, expiresAt: { gt: now } } });
      if (!claimed.count) throw new ConflictException('otp.concurrent_attempt');
      const user = await tx.user.findUnique({ where: { phone } });
      if (!user || user.deletedAt || ['Banned', 'Suspended', 'Archived'].includes(user.status)) {
        throw new UnauthorizedException('otp.account_unavailable');
      }
      await tx.user.update({ where: { id: user.id }, data: {
        phoneVerifiedAt: now,
        status: user.status === AccountStatus.PendingVerification ? AccountStatus.Active : user.status,
      } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'auth.phone_verified', entityType: 'User', entityId: user.id,
        after: { phoneVerified: true } } });
    });
    return { verified: true };
  }

  private pinHash(phone: string, pin: string) {
    const secret = this.config.get<string>('RESALA_OTP_SECRET') ?? this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    return createHmac('sha256', secret).update(`${phone}:${pin}`).digest('hex');
  }
}
