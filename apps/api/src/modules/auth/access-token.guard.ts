import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedRequest } from './auth.types';
import { requestContext } from '../../common/request-context';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('auth.access_token_required');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('auth.access_token_invalid');
    }

    if (!payload.sub || !payload.sid) throw new UnauthorizedException('auth.session_required');
    const session = await this.prisma.refreshSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('auth.session_revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user || user.deletedAt || ['Banned', 'Suspended', 'Archived'].includes(user.status)) {
      throw new UnauthorizedException('auth.account_unavailable');
    }

    request.user = {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      status: user.status,
      roles: user.roles.map((item) => item.role.code),
      permissions: Array.from(
        new Set(user.roles.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code))),
      ),
    };
    const metadata = requestContext.getStore();
    if (metadata) metadata.actorId = user.id;
    return true;
  }
}
