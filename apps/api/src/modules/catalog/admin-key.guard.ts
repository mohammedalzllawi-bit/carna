import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly access: AccessTokenGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = context.switchToHttp().getRequest<AuthenticatedRequest & { url: string; method: string; body?: { roles?: unknown } }>();
    if (authenticated.headers.authorization) {
      await this.access.canActivate(context);
      const permissions = authenticated.user.permissions;
      const resource = authenticated.url.split('?')[0].split('/admin/')[1]?.split('/')[0];
      const permission = ({
        overview: 'admin.access', users: 'users.manage', vehicles: 'vehicles.approve',
        cities: 'settings.manage', technicians: 'technicians.manage', settings: 'settings.manage',
        auctions: 'auctions.manage', wallet: 'payments.read', payments: 'payments.read',
        dealers: 'dealers.approve', 'auction-listings': 'auctions.manage', reviews: 'reviews.manage',
        roles: 'permissions.manage', audit: 'audit.read', notifications: 'notifications.manage',
        messages: 'support.manage', subscriptions: 'settings.manage', content: 'settings.manage', requests: 'support.manage',
      } as Record<string, string>)[resource ?? ''];
      if (!permission || !permissions.includes('admin.access') || !permissions.includes(permission)) {
        throw new ForbiddenException('admin.permission_denied');
      }
      if (resource === 'users' && authenticated.body?.roles && !permissions.includes('permissions.manage')) {
        throw new ForbiddenException('admin.role_assignment_denied');
      }
      if (resource === 'users' && Array.isArray(authenticated.body?.roles) &&
          authenticated.body.roles.includes('SUPER_ADMIN') && !authenticated.user.roles.includes('SUPER_ADMIN')) {
        throw new ForbiddenException('admin.super_admin_assignment_denied');
      }
      if (resource === 'wallet' && authenticated.method === 'POST' && !permissions.includes('payments.refund')) {
        throw new ForbiddenException('admin.wallet_adjustment_denied');
      }
      return true;
    }
    if (this.config.get<string>('NODE_ENV') === 'production' || this.config.get<string>('ALLOW_LEGACY_ADMIN_KEY') !== 'true') {
      throw new UnauthorizedException('admin.account_session_required');
    }
    const configuredKey = this.config.get<string>('ADMIN_API_KEY');
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const suppliedKey = request.headers['x-admin-key'];

    if (!configuredKey || !suppliedKey) {
      throw new UnauthorizedException('admin.authentication_required');
    }

    const expected = Buffer.from(configuredKey);
    const actual = Buffer.from(suppliedKey);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('admin.invalid_credentials');
    }

    return true;
  }
}
