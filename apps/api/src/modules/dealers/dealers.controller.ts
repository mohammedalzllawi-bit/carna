import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { DealerStatus } from '@prisma/client';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { CreateVehicleDto, UpdateVehicleDto } from '../catalog/dto/catalog.dto';
import { DealersService } from './dealers.service';
import {
  AdminCreateDealerDto,
  CreateDealerReviewDto,
  DealerAuctionRequestDto,
  ManageDealerSubscriptionDto,
  ModerateDealerReviewDto,
  RequestDealerSubscriptionDto,
  SaveCapabilityOverrideDto,
  SaveDealerPlanDto,
  SavePlanCapabilityDto,
  UpdateDealerStatusDto,
  UpdateOwnDealerDto,
} from './dto/dealer.dto';

@ApiTags('Dealers')
@Controller({ path: 'dealers', version: '1' })
export class DealersController {
  constructor(private readonly dealers: DealersService) {}

  @Get()
  list() { return this.dealers.publicList(); }

  @Get('plans')
  plans() { return this.dealers.listPlans(); }

  @Get('plan-capabilities')
  planCapabilities() { return this.dealers.planCapabilities(true); }

  @Get(':id')
  detail(@Param('id') id: string) { return this.dealers.publicDetail(id); }

  @Post(':id/reviews')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  review(@Param('id') id: string, @Body() input: CreateDealerReviewDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.review(id, req.user.id, input);
  }
}

@ApiTags('Dealer Portal')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions('dealers.manage_own')
@Controller({ path: 'dealer', version: '1' })
export class DealerPortalController {
  constructor(private readonly dealers: DealersService) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) { return this.dealers.myDashboard(req.user.id); }

  @Patch('me')
  update(@Body() input: UpdateOwnDealerDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.updateOwn(req.user.id, input);
  }

  @Post('subscriptions')
  subscription(@Body() input: RequestDealerSubscriptionDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.requestSubscription(req.user.id, input);
  }

  @Get('vehicles')
  vehicles(@Req() req: AuthenticatedRequest) { return this.dealers.myDashboard(req.user.id).then((data) => data.vehicles); }

  @Post('vehicles')
  createVehicle(@Body() input: CreateVehicleDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.createVehicle(req.user.id, input);
  }

  @Patch('vehicles/:id')
  updateVehicle(@Param('id') id: string, @Body() input: UpdateVehicleDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.updateVehicle(req.user.id, id, input);
  }

  @Post('vehicles/:id/submit')
  submitVehicle(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.dealers.submitVehicle(req.user.id, id);
  }

  @Post('vehicles/:id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 12, { limits: { fileSize: 8 * 1024 * 1024, files: 12 } }))
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: { buffer: Buffer; mimetype: string; size: number; originalname?: string }[],
    @Body('category') category: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.dealers.uploadVehicleImages(req.user.id, id, files, category);
  }

  @Delete('vehicles/:vehicleId/images/:imageId')
  deleteImage(
    @Param('vehicleId') vehicleId: string,
    @Param('imageId') imageId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.dealers.deleteVehicleImage(req.user.id, vehicleId, imageId);
  }

  @Post('vehicles/:id/auction')
  requestAuction(@Param('id') id: string, @Body() input: DealerAuctionRequestDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.requestVehicleAuction(req.user.id, id, input);
  }
}

@ApiTags('Admin Dealers')
@ApiBearerAuth()
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin/dealers', version: '1' })
export class AdminDealersController {
  constructor(private readonly dealers: DealersService) {}

  @Get()
  list() { return this.dealers.adminList(); }

  @Post()
  create(@Body() input: AdminCreateDealerDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.adminCreate(input, req.user.id);
  }

  @Get('plans')
  plans() { return this.dealers.listPlans(false); }

  @Get('plan-capabilities')
  planCapabilities() { return this.dealers.planCapabilities(false); }

  @Post('plan-capabilities')
  createPlanCapability(@Body() input: SavePlanCapabilityDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.savePlanCapability(null, input, req.user.id);
  }

  @Patch('plan-capabilities/:code')
  updatePlanCapability(@Param('code') code: string, @Body() input: SavePlanCapabilityDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.savePlanCapability(code, input, req.user.id);
  }

  @Get('capability-overrides/:subjectType/:subjectId')
  capabilityOverrides(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string) {
    return this.dealers.capabilityOverrides(subjectType, subjectId);
  }

  @Patch('capability-overrides/:subjectType/:subjectId')
  saveCapabilityOverride(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @Body() input: SaveCapabilityOverrideDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.dealers.saveCapabilityOverride(subjectType, subjectId, input, req.user.id);
  }

  @Post('plans')
  createPlan(@Body() input: SaveDealerPlanDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.savePlan(null, input, req.user.id);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() input: SaveDealerPlanDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.savePlan(id, input, req.user.id);
  }

  @Delete('plans/:id')
  archivePlan(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.dealers.archivePlan(id, req.user.id);
  }

  @Get('reviews')
  reviews() { return this.dealers.listReviewsAdmin(); }

  @Patch('reviews/:id')
  review(@Param('id') id: string, @Body() input: ModerateDealerReviewDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.moderateReview(id, input, req.user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string) { return this.dealers.adminDetail(id); }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body() input: UpdateDealerStatusDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.changeStatus(id, input.status as DealerStatus, req.user.id);
  }

  @Post(':id/subscriptions')
  subscription(@Param('id') id: string, @Body() input: ManageDealerSubscriptionDto, @Req() req: AuthenticatedRequest) {
    return this.dealers.manageSubscription(id, input, req.user.id);
  }
}
