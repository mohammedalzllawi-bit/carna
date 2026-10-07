import { Body, Controller, Get, Module, Post, Req, UseGuards } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionsService } from './subscriptions.service';
import { ManageMemberSubscriptionDto, RequestSubscriptionDto } from './subscriptions.dto';

@Controller({ path: 'subscriptions', version: '1' })
class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}
  @Get('plans') plans() { return this.subscriptions.plans(); }
  @Get('me') @UseGuards(AccessTokenGuard) mine(@Req() req: AuthenticatedRequest) { return this.subscriptions.mine(req.user.id); }
  @Post() @UseGuards(AccessTokenGuard) request(@Body() input: RequestSubscriptionDto, @Req() req: AuthenticatedRequest) { return this.subscriptions.request(req.user.id, input); }
}
@Controller({ path: 'admin/subscriptions', version: '1' })
@UseGuards(AdminKeyGuard)
class AdminSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}
  @Get() list() { return this.subscriptions.adminList(); }
  @Post() manage(@Body() input: ManageMemberSubscriptionDto, @Req() req: AuthenticatedRequest) { return this.subscriptions.manage(input, req.user.id); }
}
@Module({ imports: [AuthModule, CatalogModule, SettingsModule], controllers: [SubscriptionsController, AdminSubscriptionsController], providers: [SubscriptionsService], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
