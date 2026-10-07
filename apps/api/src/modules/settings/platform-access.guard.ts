import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { SettingsService } from './settings.service';

@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(private readonly settings: SettingsService, private readonly access: AccessTokenGuard) {}

  async canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<{ url: string }>();
    const path = request.url.split('?')[0];
    if (path.startsWith('/v1/payments/webhooks/')) return true;
    if (!/^\/v1\/(catalog|auctions|technicians|wallet|payments|notifications|account)(\/|$)/.test(path)) return true;
    if (await this.settings.get<boolean>('platform.maintenance_mode')) throw new ServiceUnavailableException('platform.maintenance');
    if (!(await this.settings.get<boolean>('platform.guest_mode_enabled'))) return this.access.canActivate(context);
    return true;
  }
}
