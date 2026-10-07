import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AccessTokenPayload, RequestMetadata } from './auth.types';
import { SettingsService } from '../settings/settings.service';
import { notRevoked } from '../../common/mongo-filters';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async guest() {
    const enabled = await this.settings.get<boolean>('platform.guest_mode_enabled');
    if (!enabled) throw new ServiceUnavailableException('guest.disabled');
    return {
      mode: 'guest',
      capabilities: ['catalog.read', 'auctions.read', 'technicians.read'],
      requiresAccount: ['favorites', 'inspections', 'bidding', 'payments', 'disputes'],
    };
  }

  async register(input: RegisterDto, metadata: RequestMetadata) {
    const phone = this.normalizePhone(input.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('auth.phone_already_registered');

    const customerRole = await this.prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
    if (!customerRole) throw new Error('auth.customer_role_missing');

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let user: UserWithRoles;
    try {
      user = await this.prisma.user.create({
        data: {
          phone,
          fullName: input.fullName.trim(),
          passwordHash,
          status: AccountStatus.PendingVerification,
          roles: { create: { roleId: customerRole.id } },
        },
        include: { roles: { include: { role: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('auth.phone_already_registered');
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.user.registered',
        entityType: 'User',
        entityId: user.id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return this.issueTokens(user, metadata);
  }

  async login(input: LoginDto, metadata: RequestMetadata) {
    const phone = this.normalizePhone(input.phone);
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException('auth.invalid_credentials');

    const passwordValid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!passwordValid) throw new UnauthorizedException('auth.invalid_credentials');
    if (['Banned', 'Suspended', 'Archived'].includes(user.status)) {
      throw new UnauthorizedException('auth.account_unavailable');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.user.logged_in',
        entityType: 'User',
        entityId: user.id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return this.issueTokens(user, metadata);
  }

  async refresh(refreshToken: string, metadata: RequestMetadata) {
    const tokenHash = this.hashToken(refreshToken);
    const current = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!current || current.revokedAt || current.expiresAt <= new Date()) {
      throw new UnauthorizedException('auth.refresh_token_invalid');
    }
    if (current.user.deletedAt || ['Banned', 'Suspended', 'Archived'].includes(current.user.status)) {
      throw new UnauthorizedException('auth.account_unavailable');
    }

    const nextRefreshToken = randomBytes(48).toString('base64url');
    const nextHash = this.hashToken(nextRefreshToken);
    const nextSession = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshSession.updateMany({
        where: { id: current.id, ...notRevoked, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('auth.refresh_token_invalid');
      return tx.refreshSession.create({
        data: {
          userId: current.userId,
          tokenHash: nextHash,
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
          expiresAt: new Date(Date.now() + this.refreshLifetimeSeconds() * 1000),
        },
      });
    });

    return {
      user: this.publicUser(current.user),
      accessToken: await this.signAccessToken(current.user, nextSession.id),
      refreshToken: nextRefreshToken,
      accessExpiresIn: this.accessLifetimeSeconds(),
      refreshExpiresIn: this.refreshLifetimeSeconds(),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { success: true };
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), ...notRevoked },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  private async issueTokens(user: UserWithRoles, metadata: RequestMetadata) {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt: new Date(Date.now() + this.refreshLifetimeSeconds() * 1000),
      },
    });
    return {
      user: this.publicUser(user),
      accessToken: await this.signAccessToken(user, session.id),
      refreshToken,
      accessExpiresIn: this.accessLifetimeSeconds(),
      refreshExpiresIn: this.refreshLifetimeSeconds(),
    };
  }

  private signAccessToken(user: UserWithRoles, sessionId: string) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((item) => item.role.code),
    };
    return this.jwt.signAsync(payload, { expiresIn: this.accessLifetimeSeconds() });
  }

  private publicUser(user: UserWithRoles) {
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      status: user.status,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      roles: user.roles.map((item) => item.role.code),
    };
  }

  private normalizePhone(value: string) {
    const compact = value.replace(/[\s()-]/g, '');
    return compact.startsWith('0') ? `+218${compact.slice(1)}` : compact;
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private accessLifetimeSeconds() {
    return this.durationToSeconds(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m', 900);
  }

  private refreshLifetimeSeconds() {
    return this.durationToSeconds(this.config.get<string>('JWT_REFRESH_TTL') ?? '30d', 2_592_000);
  }

  private durationToSeconds(value: string, fallback: number) {
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) return fallback;
    const amount = Number(match[1]);
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 1;
    return amount * multiplier;
  }
}
