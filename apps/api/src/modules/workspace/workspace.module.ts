import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AuthThrottleGuard } from '../auth/auth-throttle.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { WalletModule } from '../wallet/wallet.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkspaceService } from './workspace.service';
import { ChangePasswordDto, ContentDto, InspectionDto, ProfileSettingsDto, ReportDto, RequestActionDto, ReviewEditDto, SaleRequestDto, TechnicianAvailabilityDto } from './workspace.dto';
@Controller({ path: 'workspace', version: '1' }) @UseGuards(AccessTokenGuard)
class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get('requests') requests(@Req() req: AuthenticatedRequest) { return this.service.requests(req.user.id); }
  @Patch('technician/availability') availability(@Req() req: AuthenticatedRequest, @Body() input: TechnicianAvailabilityDto) { return this.service.availability(req.user.id, input.status); }
  @Post('sales') sales(@Req() req: AuthenticatedRequest, @Body() input: SaleRequestDto) { return this.service.createSale(req.user.id, input); }
  @Patch('sales/:id') saleAction(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() input: RequestActionDto) { return this.service.saleAction(id, req.user.id, input.action); }
  @Post('inspections') inspections(@Req() req: AuthenticatedRequest, @Body() input: InspectionDto) { return this.service.createInspection(req.user.id, input); }
  @Patch('inspections/:id') inspectionAction(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() input: RequestActionDto) { return this.service.inspectionAction(id, req.user.id, input.action); }
  @Post('inspections/:id/report') report(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() input: ReportDto) { return this.service.inspectionAction(id, req.user.id, 'report', input); }
  @Get('settings') settings(@Req() req: AuthenticatedRequest) { return this.service.preferences(req.user.id); }
  @Patch('settings') saveSettings(@Req() req: AuthenticatedRequest, @Body() input: ProfileSettingsDto) { return this.service.savePreferences(req.user.id, input); }
  @Post('password') @UseGuards(AuthThrottleGuard)
  password(@Req() req: AuthenticatedRequest, @Body() input: ChangePasswordDto) { return this.service.password(req.user.id, input); }
  @Get('watches') watches(@Req() req: AuthenticatedRequest) { return this.service.watches(req.user.id); }
  @Post('watches/:id') watch(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.service.watch(req.user.id, id, true); }
  @Delete('watches/:id') unwatch(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.service.watch(req.user.id, id, false); }
}
@Controller({ path: 'content', version: '1' })
class ContentController {
  constructor(private readonly service: WorkspaceService) {}
  @Get(':slug') get(@Param('slug') slug: string, @Query('locale') locale?: string) { return this.service.content(slug, locale === 'en' ? 'en' : 'ar'); }
}
@Controller({ path: 'admin/content', version: '1' }) @UseGuards(AdminKeyGuard)
class AdminContentController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list() { return this.service.contentAdmin(); }
  @Post() save(@Req() req: AuthenticatedRequest, @Body() input: ContentDto) { return this.service.saveContent(input, req.user.id); }
}
@Controller({ path: 'admin/requests', version: '1' }) @UseGuards(AdminKeyGuard)
class AdminRequestsController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@Req() req: AuthenticatedRequest) { return this.service.requests(req.user.id, true); }
}
@Controller({ path: 'admin/reviews', version: '1' }) @UseGuards(AdminKeyGuard)
class AdminReviewsController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list() { return this.service.reviewsAdmin(); }
  @Patch(':id') edit(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() input: ReviewEditDto) { return this.service.editReview(id, req.user.id, input); }
}
@Module({ imports: [AuthModule, CatalogModule, WalletModule, SettingsModule], controllers: [WorkspaceController, ContentController, AdminContentController, AdminRequestsController, AdminReviewsController], providers: [WorkspaceService] })
export class WorkspaceModule {}
