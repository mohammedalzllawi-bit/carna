import { Controller, Delete, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { toLyd } from '../../common/money';
import { notDeleted } from '../../common/mongo-filters';

@Controller({ path: 'account', version: '1' })
@UseGuards(AccessTokenGuard)
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('summary')
  async summary(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const [bids, wins, inspections, favorites] = await Promise.all([
      this.prisma.bid.count({ where: { bidderId: userId } }), this.prisma.auctionResult.count({ where: { winnerId: userId } }),
      this.prisma.inspectionRequest.count({ where: { requesterId: userId } }), this.prisma.favorite.count({ where: { userId } }),
    ]);
    return { bids, wins, inspections, favorites };
  }
  @Get('bids')
  async bids(@Req() req: AuthenticatedRequest) {
    const bids = await this.prisma.bid.findMany({ where: { bidderId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { auction: { select: { status: true, vehicle: { select: { make: true, model: true, year: true } } } } } });
    return bids.map((b) => ({ id: b.id, auctionId: b.auctionId, amountLyd: toLyd(b.amount), status: b.status, createdAt: b.createdAt, vehicle: b.auction.vehicle, auctionStatus: b.auction.status }));
  }
  @Get('favorites')
  favorites(@Req() req: AuthenticatedRequest) { return this.prisma.favorite.findMany({ where: { userId: req.user.id }, select: { vehicleId: true } }); }
  @Get('favorites/vehicles')
  async favoriteVehicles(@Req() req: AuthenticatedRequest) {
    const items = await this.prisma.favorite.findMany({ where: { userId: req.user.id, vehicle: { approvalStatus: 'Published', ...notDeleted } }, orderBy: { createdAt: 'desc' }, take: 200,
      include: { vehicle: { select: { id: true, make: true, model: true, year: true, saleType: true, images: { where: { isSensitive: false }, take: 1, select: { storageKey: true, thumbnailKey: true } } } } } });
    return items.map((i) => ({ ...i.vehicle, imageUrl: i.vehicle.images[0]?.thumbnailKey ?? i.vehicle.images[0]?.storageKey ?? null }));
  }
  @Post('favorites/:vehicleId')
  async favorite(@Param('vehicleId') vehicleId: string, @Req() req: AuthenticatedRequest) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, ...notDeleted, approvalStatus: 'Published' } });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    return this.prisma.favorite.upsert({ where: { userId_vehicleId: { userId: req.user.id, vehicleId } }, create: { userId: req.user.id, vehicleId }, update: {} });
  }
  @Delete('favorites/:vehicleId')
  unfavorite(@Param('vehicleId') vehicleId: string, @Req() req: AuthenticatedRequest) { return this.prisma.favorite.deleteMany({ where: { vehicleId, userId: req.user.id } }); }
}
