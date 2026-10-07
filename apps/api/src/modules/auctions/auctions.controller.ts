import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { AuctionsService } from './auctions.service';
import { AuctionQueryDto, ChangeAuctionStatusDto, CreateAuctionDto, CreateAuctionListingRequestDto, PlaceBidDto, RejectAuctionListingDto } from './dto/auction.dto';

@ApiTags('Auctions')
@Controller({ path: 'auctions', version: '1' })
export class AuctionsController {
  constructor(private readonly auctions: AuctionsService) {}
  @Get()
  list(@Query() query: AuctionQueryDto) { return this.auctions.listPublic(query.status, query.page); }
  @Get(':id')
  get(@Param('id') id: string) { return this.auctions.getPublic(id); }

  @Get(':id/me')
  @UseGuards(AccessTokenGuard)
  me(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.auctions.participation(id, request.user.id);
  }

  @Post(':id/cancel')
  @UseGuards(AccessTokenGuard)
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.auctions.cancelNoWinner(id, request.user.id);
  }

  @Post(':id/bids')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions('auctions.bid')
  bid(@Param('id') id: string, @Body() input: PlaceBidDto, @Req() request: AuthenticatedRequest & { ip?: string }) {
    const agent = request.headers['user-agent'];
    return this.auctions.placeBid({ auctionId: id, bidderId: request.user.id,
      amount: this.auctions.lydToMilli(input.amountLyd), idempotencyKey: input.idempotencyKey,
      ipAddress: request.ip, userAgent: Array.isArray(agent) ? agent[0] : agent });
  }
}

@ApiTags('Admin Auctions')
@ApiBearerAuth()
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin/auctions', version: '1' })
export class AdminAuctionsController {
  constructor(private readonly auctions: AuctionsService) {}
  @Get()
  list() { return this.auctions.listAdmin(); }
  @Post()
  create(@Body() input: CreateAuctionDto) { return this.auctions.create(input); }
  @Patch(':id/status')
  status(@Param('id') id: string, @Body() input: ChangeAuctionStatusDto) { return this.auctions.changeStatus(id, input.status); }
}

@ApiTags('Auction Listing Requests')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions('vehicles.create_own', 'payments.create')
@Controller({ path: 'auction-listings', version: '1' })
export class AuctionListingsController {
  constructor(private readonly auctions: AuctionsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.auctions.ownListingRequests(req.user.id); }
  @Post()
  create(@Body() input: CreateAuctionListingRequestDto, @Req() req: AuthenticatedRequest) {
    return this.auctions.requestListing(req.user.id, input);
  }

  @Post(':vehicleId/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 12, { limits: { fileSize: 8 * 1024 * 1024, files: 12 } }))
  uploadImages(
    @Param('vehicleId') vehicleId: string,
    @UploadedFiles() files: { buffer: Buffer; mimetype: string; size: number; originalname?: string }[],
    @Body('category') category: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auctions.uploadOwnListingImages(req.user.id, vehicleId, files, category);
  }
}

@ApiTags('Admin Auction Listing Requests')
@ApiBearerAuth()
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin/auction-listings', version: '1' })
export class AdminAuctionListingsController {
  constructor(private readonly auctions: AuctionsService) {}
  @Get()
  list() { return this.auctions.listAdminListingRequests(); }
  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.auctions.approveListing(id, req.user.id); }
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() input: RejectAuctionListingDto, @Req() req: AuthenticatedRequest) {
    return this.auctions.rejectListing(id, input.reason, req.user.id);
  }
}
