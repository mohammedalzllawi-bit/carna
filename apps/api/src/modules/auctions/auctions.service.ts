import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccountStatus, AuctionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';
import { CreateAuctionDto, CreateAuctionListingRequestDto } from './dto/auction.dto';
import { percentage, toLyd, toMilli } from '../../common/money';
import { notDeleted } from '../../common/mongo-filters';
import { FeesService } from '../fees/fees.service';
import { ImageUpload, MediaStorageService, StoredImage } from '../media/media-storage.service';
import { BidWalletPolicy, requiredBidBalance } from './bid-wallet-policy';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export interface PlaceBidInput {
  auctionId: string;
  bidderId: string;
  amount: bigint | number | string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface CreateAuctionOptions {
  allowPendingReview?: boolean;
  actorId?: string;
  auditAction?: string;
}

const auctionDetailsInclude = {
  vehicle: {
    include: {
      city: true,
      dealer: { include: { staff: { select: { userId: true } } } },
      images: { where: { isSensitive: false }, orderBy: { sortOrder: 'asc' as const }, take: 8 },
    },
  },
  bids: {
    where: { status: { in: ['Accepted' as const, 'Outbid' as const] } },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
    select: { id: true, bidderId: true, amount: true, createdAt: true },
  },
  result: true,
};

type AuctionDetails = Prisma.AuctionGetPayload<{ include: typeof auctionDetailsInclude }>;

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: AuctionRealtimeGateway,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly fees?: FeesService,
    @Optional() private readonly media?: MediaStorageService,
    private readonly subscriptions?: SubscriptionsService,
  ) {}

  async listPublic(status?: string, page = 1) {
    const safePage = Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
    const auctions = await this.prisma.auction.findMany({
      where: { vehicle: { approvalStatus: 'Published', ...notDeleted }, ...(status
        ? { status: status as AuctionStatus }
        : { status: { in: [AuctionStatus.Scheduled, AuctionStatus.Live, AuctionStatus.Paused] } }) },
      include: auctionDetailsInclude,
      orderBy: [{ status: 'asc' }, { startsAt: 'asc' }],
      skip: (safePage - 1) * 30,
      take: 30,
    });
    return auctions.map((auction) => this.serialize(auction));
  }

  async getPublic(id: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id },
      include: auctionDetailsInclude,
    });
    if (!auction || auction.vehicle.deletedAt || auction.vehicle.approvalStatus !== 'Published') throw new NotFoundException('auction.not_found');
    return this.serialize(auction);
  }

  async participation(id: string, userId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id },
      include: { result: true, vehicle: { include: { dealer: { include: { staff: { select: { userId: true, status: true } } } } } } } });
    if (!auction || auction.vehicle.deletedAt || auction.vehicle.approvalStatus !== 'Published') throw new NotFoundException('auction.not_found');
    const [user, wallet, policy, pastBids] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, phoneVerifiedAt: true, deletedAt: true } }),
      this.prisma.walletAccount.findUnique({ where: { userId_currency: { userId, currency: 'LYD' } } }),
      this.bidWalletPolicy(),
      this.prisma.bid.count({ where: { auctionId: id, bidderId: userId, status: { in: ['Accepted', 'Outbid'] } } }),
    ]);
    const required = requiredBidBalance(auction, policy);
    const isSeller = auction.vehicle.ownerUserId === userId || auction.vehicle.dealer?.ownerUserId === userId ||
      Boolean(auction.vehicle.dealer?.staff.some((staff) => staff.userId === userId && staff.status === 'Approved'));
    return { isLeading: auction.highestBidderId === userId, isOutbid: pastBids > 0 && auction.highestBidderId !== userId, isSeller,
      canCancel: isSeller && auction.status === 'NoWinner' && !auction.result?.reserveMet,
      balanceLyd: toLyd(wallet?.balance ?? 0n), requiredBalanceLyd: toLyd(required),
      walletEligible: (wallet?.balance ?? 0n) >= required,
      canBid: !isSeller && user?.status === 'Active' && Boolean(user.phoneVerifiedAt) && !user.deletedAt &&
        (wallet?.balance ?? 0n) >= required,
    };
  }

  async cancelNoWinner(id: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({ where: { id }, include: {
        result: true, vehicle: { include: { dealer: { include: { staff: { select: { userId: true, status: true } } } } } },
      } });
      if (!auction) throw new NotFoundException('auction.not_found');
      const seller = auction.vehicle.ownerUserId === userId || auction.vehicle.dealer?.ownerUserId === userId ||
        Boolean(auction.vehicle.dealer?.staff.some((staff) => staff.userId === userId && staff.status === 'Approved'));
      if (!seller) throw new ForbiddenException('auction.seller_required');
      if (auction.status !== 'NoWinner' || !auction.result || auction.result.reserveMet) throw new ConflictException('auction.cannot_cancel_result');
      const changed = await tx.auction.updateMany({ where: { id, status: 'NoWinner', version: auction.version },
        data: { status: 'Cancelled', version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('auction.concurrent_update');
      await tx.auctionResult.update({ where: { auctionId: id }, data: { status: 'Cancelled' } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'auction.seller_cancelled_no_winner',
        entityType: 'Auction', entityId: id, before: { status: 'NoWinner' }, after: { status: 'Cancelled' } } });
      return { auctionId: id, status: 'Cancelled' };
    });
    this.realtime?.broadcastStatus(id, result);
    return result;
  }

  async listAdmin() {
    const auctions = await this.prisma.auction.findMany({
      include: auctionDetailsInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return auctions.map((auction) => this.serialize(auction, true));
  }

  async create(input: CreateAuctionDto, options: CreateAuctionOptions = {}) {
    const startsAt = new Date(input.startsAt);
    if (input.rollingRound && input.endsAt) throw new BadRequestException('auction.round_end_conflict');
    const roundSeconds = input.rollingRound ? await this.setting<number>('auction.round_seconds', 120) : null;
    const endsAt = input.rollingRound ? new Date(startsAt.getTime() + roundSeconds! * 1000) : new Date(input.endsAt ?? NaN);
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new BadRequestException('auction.invalid_schedule');
    if (endsAt <= new Date()) throw new BadRequestException('auction.end_must_be_future');
    const bidIncrement = input.bidIncrementLyd === undefined
      ? BigInt(await this.setting<number>('auction.bid_increment_milli', 100_000))
      : toMilli(input.bidIncrementLyd);
    if (bidIncrement <= 0n) throw new BadRequestException('auction.increment_required');

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      include: { images: { orderBy: { sortOrder: 'asc' } }, damageReports: true },
    });
    if (!vehicle || vehicle.deletedAt) throw new NotFoundException('vehicle.not_found');
    if (vehicle.approvalStatus !== 'Published' && !(options.allowPendingReview && vehicle.approvalStatus === 'PendingReview')) {
      throw new ConflictException('auction.vehicle_not_approved');
    }
    const active = await this.prisma.auction.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: {
          in: [AuctionStatus.Scheduled, AuctionStatus.Live, AuctionStatus.Paused, AuctionStatus.PaymentPending],
        },
      },
    });
    if (active) throw new ConflictException('auction.vehicle_already_scheduled');

    const antiSnipingEnabled = await this.setting<boolean>('auction.anti_sniping_enabled', true);
    const windowSeconds = antiSnipingEnabled
      ? await this.setting<number>('auction.anti_sniping_window_seconds', 120)
      : 0;
    const extensionSeconds = antiSnipingEnabled
      ? await this.setting<number>('auction.anti_sniping_extension_seconds', 120)
      : 0;
    const ruleSnapshot = {
      depositBasisPoints: await this.setting<number>('auction.deposit_basis_points', 1000),
      buyerFeeMilli: await this.setting<number>('auction.buyer_fee_milli', 0),
      paymentDeadlineMinutes: await this.setting<number>('auction.winner_payment_deadline_minutes', 120),
      fallbackWinners: await this.setting<number>('auction.fallback_winners', 2),
      autoRelist: await this.setting<boolean>('auction.auto_relist', false),
      rollingRound: input.rollingRound === true,
      roundSeconds,
    };

    const auction = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.vehicle.updateMany({
        where: { id: vehicle.id, auctionLocked: false, auctionVersion: vehicle.auctionVersion },
        data: {
          auctionLocked: true,
          auctionVersion: { increment: 1 },
          ...(options.allowPendingReview ? { approvalStatus: 'Published', publishedAt: vehicle.publishedAt ?? new Date() } : {}),
        },
      });
      if (!locked.count) throw new ConflictException('auction.vehicle_already_scheduled');
      const created = await tx.auction.create({
        data: {
          vehicleId: vehicle.id,
          description: input.description?.trim() || null,
          startsAt,
          endsAt,
          startingPrice: this.lydToMilli(input.startingPriceLyd),
          bidIncrement,
          reservePrice: input.reservePriceLyd ? this.lydToMilli(input.reservePriceLyd) : null,
          antiSnipingWindowSeconds: windowSeconds,
          antiSnipingExtensionSeconds: extensionSeconds,
          ruleSnapshot,
          status: startsAt <= new Date() ? AuctionStatus.Live : AuctionStatus.Scheduled,
        },
      });
      await tx.vehicleSnapshot.create({
        data: {
          vehicleId: vehicle.id,
          reason: 'AuctionScheduled',
          data: this.vehicleSnapshot(vehicle),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: options.actorId,
          action: options.auditAction ?? 'admin.auction.created',
          entityType: 'Auction',
          entityId: created.id,
          after: {
            vehicleId: vehicle.id,
            description: created.description,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            startingPriceMilli: created.startingPrice.toString(),
          },
        },
      });
      return created;
    });
    return this.getPublic(auction.id);
  }

  async requestListing(userId: string, input: CreateAuctionListingRequestDto) {
    const startsAt = new Date(input.startsAt);
    if (input.rollingRound && input.endsAt) throw new BadRequestException('auction.round_end_conflict');
    const roundSeconds = input.rollingRound ? await this.setting<number>('auction.round_seconds', 120) : null;
    const endsAt = input.rollingRound ? new Date(startsAt.getTime() + roundSeconds! * 1000) : new Date(input.endsAt ?? NaN);
    if (startsAt <= new Date()) throw new BadRequestException('auction.start_must_be_future');
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new BadRequestException('auction.invalid_schedule');
    const city = await this.prisma.city.findFirst({ where: { id: input.cityId, isActive: true } });
    if (!city) throw new BadRequestException('city.invalid');
    if (input.regionId && !(await this.prisma.region.findFirst({ where: { id: input.regionId, cityId: input.cityId, isActive: true } }))) {
      throw new BadRequestException('region.invalid');
    }
    const startingPrice = this.lydToMilli(input.startingPriceLyd);
    const configuredFee = await this.fees?.resolveMilli('auction.listing', { userId, baseMilli: startingPrice });
    const fee = configuredFee ?? BigInt(await this.setting<number>('auction.listing_fee_milli', 50_000));
    const expiryMinutes = await this.setting<number>('auction.listing_order_expiry_minutes', 2880);
    const now = new Date();
    const paid = fee === 0n;
    const result = await this.prisma.$transaction(async (tx) => {
      if (!this.subscriptions) throw new ServiceUnavailableException('subscription.service_unavailable');
      await this.subscriptions.consumeAuction(tx, userId);
      const vehicle = await tx.vehicle.create({ data: {
        lotNumber: await this.nextLotNumber(tx),
        ownerUserId: userId,
        category: input.category ?? 'Car',
        make: input.make.trim(), model: input.model.trim(), trim: input.trim?.trim() || null,
        year: input.year, cityId: input.cityId, regionId: input.regionId || null,
        exteriorColor: input.exteriorColor?.trim() || null,
        interiorColor: input.interiorColor?.trim() || null,
        fuelType: input.fuelType?.trim() || null,
        transmission: input.transmission?.trim() || null,
        drivetrain: input.drivetrain?.trim() || null,
        mileageKm: input.mileageKm,
        engineCapacityCc: input.engineCapacityCc,
        cylinders: input.cylinders,
        bodyType: input.bodyType?.trim() || null,
        doors: input.doors,
        seats: input.seats,
        registrationStatus: input.registrationStatus?.trim() || null,
        ownershipStatus: input.ownershipStatus?.trim() || null,
        address: input.address?.trim() || null,
        condition: input.condition, saleType: 'Auction', approvalStatus: paid ? 'PendingReview' : 'Draft',
      } });
      const order = await tx.order.create({ data: {
        userId, type: 'AuctionListingFee', status: paid ? 'Paid' : 'PaymentPending',
        subtotal: fee, total: fee, currency: 'LYD', referenceId: vehicle.id,
        expiresAt: paid ? null : new Date(now.getTime() + expiryMinutes * 60_000),
        metadata: {
          description: input.description?.trim() || null,
          startsAt: input.startsAt, endsAt: endsAt.toISOString(), rollingRound: input.rollingRound === true,
          startingPriceLyd: input.startingPriceLyd,
          bidIncrementLyd: input.bidIncrementLyd ?? null, reservePriceLyd: input.reservePriceLyd ?? null,
        },
      } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'user.auction_listing.created', entityType: 'Order', entityId: order.id,
        after: { vehicleId: vehicle.id, feeMilli: fee.toString(), paymentRequired: !paid } } });
      return { vehicle, order };
    });
    return { vehicle: { id: result.vehicle.id, lotNumber: result.vehicle.lotNumber, approvalStatus: result.vehicle.approvalStatus },
      order: { id: result.order.id, status: result.order.status, totalLyd: toLyd(result.order.total), currency: result.order.currency,
        expiresAt: result.order.expiresAt }, paymentRequired: !paid };
  }

  async ownListingRequests(userId: string) {
    const orders = await this.prisma.order.findMany({ where: { userId, type: 'AuctionListingFee' }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { payments: { select: { id: true, status: true, provider: true, checkoutUrl: true } } } });
    const vehicleIds = orders.map((order) => order.referenceId).filter((id): id is string => Boolean(id));
    const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds }, ownerUserId: userId }, include: { auctions: { take: 1, orderBy: { createdAt: 'desc' } } } });
    const byId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    return orders.map((order) => { const vehicle = order.referenceId ? byId.get(order.referenceId) : undefined; return {
      id: order.id, status: order.status, totalLyd: toLyd(order.total), expiresAt: order.expiresAt, createdAt: order.createdAt,
      vehicle: vehicle ? { id: vehicle.id, lotNumber: vehicle.lotNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year, approvalStatus: vehicle.approvalStatus,
        auctionId: vehicle.auctions[0]?.id ?? null } : null, payments: order.payments,
    }; });
  }

  async uploadOwnListingImages(userId: string, vehicleId: string, files: ImageUpload[], category?: string) {
    if (!this.media) throw new ServiceUnavailableException('media.storage_unavailable');
    const media = this.media;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerUserId: userId, dealerId: null, ...notDeleted },
      include: { images: true },
    });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    if (vehicle.auctionLocked || vehicle.approvalStatus === 'Archived') {
      throw new ConflictException('vehicle.images_locked');
    }
    if (!files?.length) throw new BadRequestException('media.image_required');
    if (vehicle.images.length + files.length > 24) throw new ConflictException('vehicle.image_limit_reached');
    const imageCategory = category?.trim() || 'gallery';
    if (!/^[\p{L}\p{N}_ -]{1,50}$/u.test(imageCategory)) {
      throw new BadRequestException('vehicle.invalid_image_category');
    }

    const assets: StoredImage[] = [];
    try {
      for (const file of files) {
        assets.push(await media.storeImage(file, {
          folder: `vehicle-${vehicle.id}`,
          maxBytes: 8 * 1024 * 1024,
        }));
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const images = [];
        for (let index = 0; index < assets.length; index += 1) {
          const asset = assets[index];
          images.push(await tx.vehicleImage.create({ data: {
            vehicleId: vehicle.id,
            category: imageCategory,
            storageKey: asset.storageKey,
            thumbnailKey: asset.thumbnailUrl,
            sortOrder: vehicle.images.length + index,
          } }));
        }
        await tx.auditLog.create({ data: {
          actorId: userId,
          action: 'user.auction_listing_images.uploaded',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          after: { count: images.length, provider: assets[0]?.provider, category: imageCategory },
        } });
        return images;
      });
      return created.map((image) => ({
        id: image.id,
        category: image.category,
        url: image.thumbnailKey,
        sortOrder: image.sortOrder,
      }));
    } catch (error) {
      await Promise.allSettled(assets.map((asset) => media.delete(asset.storageKey)));
      throw error;
    }
  }

  async listAdminListingRequests() {
    const orders = await this.prisma.order.findMany({ where: { type: 'AuctionListingFee' }, orderBy: { createdAt: 'desc' }, take: 300,
      include: { user: { select: { id: true, fullName: true, phone: true } }, payments: { select: { id: true, status: true, provider: true } } } });
    const vehicleIds = orders.map((order) => order.referenceId).filter((id): id is string => Boolean(id));
    const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, include: { city: { select: { nameAr: true } }, auctions: { take: 1 } } });
    const byId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    return orders.map((order) => { const vehicle = order.referenceId ? byId.get(order.referenceId) : undefined; return {
      id: order.id, status: order.status, totalLyd: toLyd(order.total), expiresAt: order.expiresAt, metadata: order.metadata,
      user: order.user, vehicle: vehicle ? { id: vehicle.id, lotNumber: vehicle.lotNumber, make: vehicle.make, model: vehicle.model,
        year: vehicle.year, city: vehicle.city?.nameAr ?? null, approvalStatus: vehicle.approvalStatus, auctionId: vehicle.auctions[0]?.id ?? null } : null,
      payments: order.payments, createdAt: order.createdAt,
    }; });
  }

  async approveListing(orderId: string, actorId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, type: 'AuctionListingFee' } });
    if (!order?.referenceId) throw new NotFoundException('auction_listing.not_found');
    if (order.status !== 'Paid') throw new ConflictException('auction_listing.payment_required');
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: order.referenceId },
      include: { images: { where: { isSensitive: false } } },
    });
    if (!vehicle || vehicle.approvalStatus !== 'PendingReview') throw new ConflictException('auction_listing.not_pending_review');
    const minimumImages = await this.setting<number>('vehicle.minimum_listing_images', 4);
    if (vehicle.images.length < minimumImages) throw new ConflictException('auction_listing.minimum_images_required');
    const metadata = this.listingMetadata(order.metadata);
    const auction = await this.create({ vehicleId: vehicle.id, ...metadata }, {
      allowPendingReview: true, actorId, auditAction: 'admin.auction_listing.approved',
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.notification.create({ data: { userId: order.userId, title: 'تم اعتماد طلب المزاد',
        body: `تم اعتماد السيارة ${vehicle.lotNumber} وإضافتها إلى المزادات.`, data: { type: 'auction_listing_approved', auctionId: auction.id, orderId } } });
      await tx.order.update({ where: { id: orderId }, data: { metadata: { ...metadata, auctionId: auction.id, approvedAt: new Date().toISOString() } } });
    });
    return auction;
  }

  async rejectListing(orderId: string, reason: string, actorId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, type: 'AuctionListingFee' } });
    if (!order?.referenceId) throw new NotFoundException('auction_listing.not_found');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: order.referenceId } });
    if (!vehicle || vehicle.auctionLocked) throw new ConflictException('auction_listing.cannot_reject');
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { approvalStatus: 'Rejected' } });
      if (order.status === 'PaymentPending') await tx.order.update({ where: { id: order.id }, data: { status: 'Cancelled' } });
      await tx.notification.create({ data: { userId: order.userId, title: 'لم يتم اعتماد طلب المزاد', body: reason,
        data: { type: 'auction_listing_rejected', orderId, paid: order.status === 'Paid' } } });
      await tx.auditLog.create({ data: { actorId, action: 'admin.auction_listing.rejected', entityType: 'Order', entityId: orderId,
        after: { vehicleId: vehicle.id, reason, paid: order.status === 'Paid', refundReviewRequired: order.status === 'Paid' } } });
      if (order.status === 'Paid') await tx.fraudAlert.create({ data: { userId: order.userId, type: 'PaidAuctionListingRejectedRefundReview', severity: 'medium',
        evidence: { orderId, vehicleId: vehicle.id, reason } } });
    });
    return { rejected: true, refundReviewRequired: order.status === 'Paid' };
  }

  async changeStatus(id: string, status: 'Live' | 'Paused' | 'Cancelled' | 'Relisted') {
    const before = await this.prisma.auction.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('auction.not_found');
    const allowed: Record<string, string[]> = {
      Scheduled: ['Live', 'Cancelled'],
      Live: ['Paused', 'Cancelled'],
      Paused: ['Live', 'Cancelled'],
      Completed: ['Relisted'],
      NoWinner: ['Relisted'],
      Cancelled: ['Relisted'],
    };
    if (!allowed[before.status]?.includes(status)) {
      throw new ConflictException('auction.invalid_status_transition');
    }
    if (status === 'Live' && (before.startsAt > new Date() || before.endsAt <= new Date())) {
      throw new ConflictException('auction.outside_schedule');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.auction.updateMany({ where: { id, status: before.status, version: before.version }, data: { status, version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('auction.concurrent_update');
      if (status === 'Cancelled') await tx.vehicle.update({ where: { id: before.vehicleId }, data: { auctionLocked: false, auctionVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: {
        action: 'admin.auction.status_changed', entityType: 'Auction', entityId: id,
        before: { status: before.status }, after: { status },
      } });
      return tx.auction.findUniqueOrThrow({
      where: { id },
      });
    });
    this.realtime?.broadcastStatus(id, {
      auctionId: id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
    return this.getPublic(id);
  }

  async placeBid(input: PlaceBidInput) {
    if ((await this.setting<string>('auction.section_state', 'Open')) !== 'Open') {
      throw new ServiceUnavailableException('auction.section_closed');
    }
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const bidAmount = this.parseStoredAmount(input.amount);
    const walletPolicy = await this.bidWalletPolicy();
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.bid.findUnique({
          where: {
            auctionId_bidderId_idempotencyKey: {
              auctionId: input.auctionId,
              bidderId: input.bidderId,
              idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.amount !== bidAmount) throw new ConflictException('bid.idempotency_conflict');
          const currentAuction = await tx.auction.findUnique({ where: { id: input.auctionId } });
          return { bid: existing, auction: currentAuction, extended: false, duplicate: true };
        }

        const bidder = await tx.user.findUnique({ where: { id: input.bidderId } });
        if (
          !bidder ||
          bidder.deletedAt ||
          bidder.status !== AccountStatus.Active ||
          !bidder.phoneVerifiedAt
        ) {
          throw new ForbiddenException('auction.bidder_not_eligible');
        }

        const auction = await tx.auction.findUnique({
          where: { id: input.auctionId },
          include: {
            vehicle: {
              include: { dealer: { include: { staff: { select: { userId: true } } } } },
            },
          },
        });
        if (!auction) throw new NotFoundException('auction.not_found');
        const now = new Date();
        if (auction.status !== AuctionStatus.Live) throw new ConflictException('auction.not_live');
        if (auction.startsAt > now) throw new ConflictException('auction.not_started');
        if (auction.endsAt <= now) throw new ConflictException('auction.ended');
        if (auction.vehicle.deletedAt || auction.vehicle.approvalStatus !== 'Published') throw new ConflictException('auction.vehicle_unavailable');
        if (auction.vehicle.dealer && auction.vehicle.dealer.status !== 'Verified') throw new ConflictException('auction.dealer_unavailable');

        const relatedUsers = new Set<string | null | undefined>([
          auction.vehicle.ownerUserId,
          auction.vehicle.dealer?.ownerUserId,
          ...(auction.vehicle.dealer?.staff.map((staff) => staff.userId) ?? []),
        ]);
        if (relatedUsers.has(input.bidderId)) {
          throw new ForbiddenException('auction.owner_cannot_bid');
        }

        const requiredBalance = requiredBidBalance(auction, walletPolicy);
        const wallet = await tx.walletAccount.findUnique({ where: { userId_currency: { userId: input.bidderId, currency: 'LYD' } } });
        if ((wallet?.balance ?? 0n) < requiredBalance) throw new ForbiddenException('auction.wallet_balance_required');
        if (requiredBalance > 0n && wallet) {
          const walletClaim = await tx.walletAccount.updateMany({
            where: { id: wallet.id, version: wallet.version, balance: { gte: requiredBalance } },
            data: { version: { increment: 1 } },
          });
          if (!walletClaim.count) throw new ConflictException('auction.wallet_balance_changed');
        }

        const currentAmount = auction.currentBidAmount ?? auction.startingPrice;
        const minimumRequired = auction.currentBidAmount === null ? auction.startingPrice : currentAmount + auction.bidIncrement;
        if (bidAmount < minimumRequired) {
          throw new BadRequestException('bid.below_minimum_increment');
        }
        if (auction.maxBidAmount !== null && bidAmount > auction.maxBidAmount) {
          throw new BadRequestException('bid.above_maximum');
        }

        const antiSnipingWindow = auction.antiSnipingWindowSeconds ?? 0;
        const antiSnipingExtension = auction.antiSnipingExtensionSeconds ?? 0;
        const secondsUntilEnd = Math.floor((auction.endsAt.getTime() - now.getTime()) / 1000);
        const shouldExtend =
          antiSnipingWindow > 0 &&
          antiSnipingExtension > 0 &&
          secondsUntilEnd <= antiSnipingWindow;
        const roundRules = auction.ruleSnapshot as { rollingRound?: boolean; roundSeconds?: number } | null;
        const nextEndsAt = roundRules?.rollingRound && roundRules.roundSeconds
          ? new Date(now.getTime() + roundRules.roundSeconds * 1000)
          : shouldExtend ? new Date(auction.endsAt.getTime() + antiSnipingExtension * 1000) : auction.endsAt;
        const extended = nextEndsAt > auction.endsAt;

        const update = await tx.auction.updateMany({
          where: {
            id: auction.id,
            version: auction.version,
            status: AuctionStatus.Live,
            endsAt: { gt: now },
          },
          data: {
            currentBidAmount: bidAmount,
            highestBidderId: input.bidderId,
            bidCount: { increment: 1 },
            version: { increment: 1 },
            endsAt: nextEndsAt,
          },
        });
        if (update.count !== 1) throw new ConflictException('bid.concurrent_update');
        if (auction.highestBidderId && auction.highestBidderId !== input.bidderId) {
          await tx.notification.create({ data: { userId: auction.highestBidderId, title: 'تم تجاوز مزايدتك', body: 'وصلت مزايدة أعلى على السيارة التي تتابعها.', data: { type: 'outbid', auctionId: auction.id, route: `/auctions/${auction.id}` } } });
        }

        await tx.bid.updateMany({
          where: { auctionId: auction.id, status: 'Accepted' },
          data: { status: 'Outbid' },
        });
        const bid = await tx.bid.create({
          data: {
            auctionId: auction.id,
            bidderId: input.bidderId,
            amount: bidAmount,
            idempotencyKey,
            status: 'Accepted',
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        });
        await tx.vehicle.update({
          where: { id: auction.vehicleId },
          data: { bidCounter: { increment: 1 } },
        });
        await tx.bidHistory.create({
          data: {
            auctionId: auction.id,
            bidId: bid.id,
            bidderId: input.bidderId,
            amount: bidAmount,
            eventType: extended ? 'BidAcceptedAndExtended' : 'BidAccepted',
            metadata: {
              previousEndsAt: auction.endsAt.toISOString(),
              nextEndsAt: nextEndsAt.toISOString(),
              idempotencyKey,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.bidderId,
            action: 'auction.bid.placed',
            entityType: 'Auction',
            entityId: auction.id,
            after: { amountMilli: bidAmount.toString(), idempotencyKey },
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        });
        const updatedAuction = await tx.auction.findUniqueOrThrow({ where: { id: auction.id } });
        return { bid, auction: updatedAuction, extended, duplicate: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.bid.findUnique({
          where: {
            auctionId_bidderId_idempotencyKey: {
              auctionId: input.auctionId,
              bidderId: input.bidderId,
              idempotencyKey,
            },
          },
        });
        if (!existing) throw error;
        if (existing.amount !== bidAmount) throw new ConflictException('bid.idempotency_conflict');
        const auction = await this.prisma.auction.findUnique({ where: { id: input.auctionId } });
        result = { bid: existing, auction, extended: false, duplicate: true };
      } else {
        if ((error as { code?: string }).code === 'P2034') throw new ConflictException('bid.concurrent_update');
        throw error;
      }
    }

    const event = {
      auctionId: input.auctionId,
      bidId: result.bid.id,
      amountLyd: this.milliToLyd(result.bid.amount),
      bidCount: result.auction?.bidCount,
      endsAt: result.auction?.endsAt,
      extended: result.extended,
      duplicate: result.duplicate,
    };
    if (!result.duplicate) this.realtime?.broadcastBid(input.auctionId, event);
    return event;
  }

  lydToMilli(value: string | number) {
    return toMilli(value);
  }

  private parseStoredAmount(value: bigint | number | string) {
    try {
      const amount = BigInt(value);
      if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error();
      return amount;
    } catch {
      throw new BadRequestException('bid.invalid_amount');
    }
  }

  private milliToLyd(value: bigint) {
    return Number(value) / 1000;
  }

  private async setting<T>(key: Parameters<SettingsService['get']>[0], fallback: T): Promise<T> {
    return this.settings ? this.settings.get<T>(key) : fallback;
  }

  private async bidWalletPolicy(): Promise<BidWalletPolicy> {
    const [mode, fixedMilli, basisPoints] = await Promise.all([
      this.setting<'Fixed' | 'Percentage'>('auction.bid_wallet_mode', 'Fixed'),
      this.setting<number>('auction.bid_wallet_fixed_milli', 100_000),
      this.setting<number>('auction.bid_wallet_basis_points', 1000),
    ]);
    return { mode, fixedMilli: BigInt(fixedMilli), basisPoints };
  }

  private serialize(auction: AuctionDetails, admin = false) {
    const current = auction.currentBidAmount ?? auction.startingPrice;
    const next = auction.currentBidAmount === null ? auction.startingPrice : current + auction.bidIncrement;
    const rules = auction.ruleSnapshot as { depositBasisPoints?: number; buyerFeeMilli?: number; paymentDeadlineMinutes?: number } | null;
    const fee = BigInt(rules?.buyerFeeMilli ?? 0);
    const deposit = percentage(next, rules?.depositBasisPoints ?? 1000);
    return {
      id: auction.id,
      description: auction.description,
      status: auction.status,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      rollingRound: Boolean((auction.ruleSnapshot as { rollingRound?: boolean } | null)?.rollingRound),
      roundSeconds: (auction.ruleSnapshot as { roundSeconds?: number } | null)?.roundSeconds ?? 120,
      startingPriceLyd: this.milliToLyd(auction.startingPrice),
      currentBidLyd: this.milliToLyd(current),
      nextBidLyd: this.milliToLyd(next),
      costs: { buyerFeeLyd: toLyd(fee), depositLyd: toLyd(deposit), dueNowLyd: toLyd(deposit + fee), totalLyd: toLyd(next + fee), remainingLyd: toLyd(next - deposit), paymentDeadlineMinutes: rules?.paymentDeadlineMinutes ?? 120 },
      bidIncrementLyd: this.milliToLyd(auction.bidIncrement),
      reserveMet: auction.reservePrice === null ? null : auction.currentBidAmount !== null && current >= auction.reservePrice,
      bidCount: auction.bidCount,
      result: auction.result ? { status: auction.result.status, reserveMet: auction.result.reserveMet, finalAmountLyd: auction.result.finalAmount === null ? null : toLyd(auction.result.finalAmount), paymentDueAt: auction.result.paymentDueAt } : null,
      vehicle: {
        id: auction.vehicle.id,
        lotNumber: auction.vehicle.lotNumber,
        make: auction.vehicle.make,
        model: auction.vehicle.model,
        year: auction.vehicle.year,
        city: auction.vehicle.city?.nameAr ?? null,
        category: auction.vehicle.category,
        condition: auction.vehicle.condition,
        mileageKm: auction.vehicle.mileageKm,
        imageUrl:
          auction.vehicle.images[0]?.thumbnailKey ?? auction.vehicle.images[0]?.storageKey ?? null,
        dealer: auction.vehicle.dealer
          ? { id: auction.vehicle.dealer.id, name: auction.vehicle.dealer.name }
          : null,
      },
      recentBids: auction.bids.map((bid) => ({
        id: bid.id,
        bidder: `${bid.bidderId.slice(0, 4)}***`,
        amountLyd: this.milliToLyd(bid.amount),
        createdAt: bid.createdAt,
      })),
      ...(admin
        ? {
            reservePriceLyd:
              auction.reservePrice === null ? null : this.milliToLyd(auction.reservePrice),
            version: auction.version,
          }
        : {}),
    };
  }

  private vehicleSnapshot(vehicle: object): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(vehicle, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
    ) as Prisma.InputJsonValue;
  }

  private async nextLotNumber(tx: Prisma.TransactionClient) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `BNG-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      if (!(await tx.vehicle.findUnique({ where: { lotNumber: candidate } }))) return candidate;
    }
    return `BNG-${Date.now()}`;
  }

  private listingMetadata(value: Prisma.JsonValue | null): Omit<CreateAuctionDto, 'vehicleId'> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConflictException('auction_listing.invalid_metadata');
    const data = value as Record<string, unknown>;
    for (const key of ['startsAt', 'endsAt', 'startingPriceLyd']) {
      if (typeof data[key] !== 'string') throw new ConflictException('auction_listing.invalid_metadata');
    }
    return { startsAt: data.startsAt as string, endsAt: data.rollingRound === true ? undefined : data.endsAt as string,
      rollingRound: data.rollingRound === true, startingPriceLyd: data.startingPriceLyd as string,
      description: typeof data.description === 'string' ? data.description : undefined,
      bidIncrementLyd: typeof data.bidIncrementLyd === 'string' ? data.bidIncrementLyd : undefined,
      reservePriceLyd: typeof data.reservePriceLyd === 'string' ? data.reservePriceLyd : undefined };
  }
}
