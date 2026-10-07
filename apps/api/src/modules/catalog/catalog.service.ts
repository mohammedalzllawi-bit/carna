import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  ApprovalStatus,
  Prisma,
  VehicleCategory,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeleted } from '../../common/mongo-filters';
import {
  AdminVehicleQueryDto,
  CreateCityDto,
  CreateVehicleDto,
  CreateOwnListingDto,
  UpdateCityDto,
  UpdateVehicleDto,
  VehicleQueryDto,
} from './dto/catalog.dto';
import { ImageUpload, MediaStorageService, StoredImage } from '../media/media-storage.service';

const vehicleInclude = {
  city: true,
  region: true,
  dealer: { select: { id: true, name: true, status: true } },
  images: { where: { isSensitive: false }, orderBy: { sortOrder: 'asc' as const } },
  auctions: { orderBy: { createdAt: 'desc' as const }, take: 1 },
};

const individualListing = { AND: [notDeleted, { OR: [
  { dealerId: null }, { dealerId: { isSet: false } },
] }] } satisfies Prisma.VehicleWhereInput;

type VehicleWithRelations = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly media?: MediaStorageService) {}

  async getCities(includeInactive = false) {
    return this.prisma.city.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { regions: { where: includeInactive ? undefined : { isActive: true } } },
      orderBy: { nameAr: 'asc' },
    });
  }

  async createCity(input: CreateCityDto) {
    const existing = await this.prisma.city.findFirst({ where: { nameAr: input.nameAr.trim() } });
    if (existing) {
      throw new BadRequestException('city.already_exists');
    }

    const city = await this.prisma.city.create({
      data: { nameAr: input.nameAr.trim(), nameEn: input.nameEn?.trim() || null },
    });
    await this.audit('admin.city.created', 'City', city.id, null, city);
    return city;
  }

  async updateCity(id: string, input: UpdateCityDto) {
    const before = await this.prisma.city.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('city.not_found');

    const city = await this.prisma.city.update({
      where: { id },
      data: {
        nameAr: input.nameAr?.trim(),
        nameEn: input.nameEn?.trim(),
        isActive: input.isActive,
      },
    });
    await this.audit('admin.city.updated', 'City', city.id, before, city);
    return city;
  }

  async listPublicVehicles(query: VehicleQueryDto) {
    const search = query.q?.trim();
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...notDeleted,
        approvalStatus: ApprovalStatus.Published,
        category: query.category && query.category !== VehicleCategory.Car ? query.category : undefined,
        AND: [
          ...(query.category === VehicleCategory.Car ? [{ OR: [
            { category: VehicleCategory.Car }, { category: { isSet: false } },
          ] }] : []),
          ...(search ? [{ OR: [
            { make: { contains: search, mode: 'insensitive' as const } },
            { model: { contains: search, mode: 'insensitive' as const } },
            { trim: { contains: search, mode: 'insensitive' as const } },
          ] }] : []),
        ],
        saleType: query.saleType,
        publishedAt: query.dateFrom ? { gte: new Date(query.dateFrom) } : undefined,
        cityId: query.cityId,
        make: query.make ? { contains: query.make.trim(), mode: 'insensitive' } : undefined,
        model: query.model ? { contains: query.model.trim(), mode: 'insensitive' } : undefined,
        quickSalePrice:
          query.maxPriceLyd === undefined
            ? undefined
            : { lte: this.lydToStoredMoney(query.maxPriceLyd) },
      },
      include: vehicleInclude,
      orderBy: query.sort === 'oldest' ? { publishedAt: 'asc' }
        : query.sort === 'price_asc' ? { quickSalePrice: 'asc' }
        : query.sort === 'price_desc' ? { quickSalePrice: 'desc' }
        : { publishedAt: 'desc' },
      take: 100,
    });
    return vehicles.map((vehicle) => this.serializeVehicle(vehicle));
  }

  async getPublicVehicle(id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, approvalStatus: ApprovalStatus.Published, ...notDeleted },
      include: vehicleInclude,
    });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    const seller = vehicle.dealerId
      ? await this.prisma.dealer.findUnique({ where: { id: vehicle.dealerId }, select: { phone: true } })
      : vehicle.ownerUserId
        ? await this.prisma.user.findUnique({ where: { id: vehicle.ownerUserId }, select: { phone: true } })
        : null;
    return { ...this.serializeVehicle(vehicle), contactPhone: seller?.phone ?? null };
  }

  async listOwnListings(userId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { ownerUserId: userId, saleType: { in: ['QuickSale', 'FixedPrice', 'Negotiable'] }, ...individualListing },
      include: vehicleInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return vehicles.map((vehicle) => this.serializeVehicle(vehicle));
  }

  async createOwnListing(userId: string, input: CreateOwnListingDto) {
    await this.assertLocation(input.cityId);
    const vehicle = await this.prisma.vehicle.create({
      data: {
        lotNumber: await this.nextLotNumber(),
        ownerUserId: userId,
        dealerId: null,
        category: input.category,
        make: input.make.trim(),
        model: input.model.trim(),
        year: input.year,
        cityId: input.cityId,
        saleType: input.saleType,
        condition: input.condition,
        quickSalePrice: this.lydToStoredMoney(input.priceLyd),
        mileageKm: input.mileageKm,
        address: input.address?.trim() || null,
        approvalStatus: ApprovalStatus.Draft,
      },
      include: vehicleInclude,
    });
    await this.prisma.auditLog.create({ data: {
      actorId: userId, action: 'user.listing.created', entityType: 'Vehicle', entityId: vehicle.id,
      after: { category: input.category, saleType: input.saleType },
    } });
    return this.serializeVehicle(vehicle);
  }

  async uploadOwnListingImages(userId: string, id: string, files: ImageUpload[]) {
    if (!this.media) throw new ConflictException('media.storage_unavailable');
    const media = this.media;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, ownerUserId: userId, ...individualListing }, include: { images: true },
    });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    if (!['Draft', 'Rejected'].includes(vehicle.approvalStatus)) throw new ConflictException('listing.images_locked');
    if (!files?.length) throw new BadRequestException('media.image_required');
    if (vehicle.images.length + files.length > 12) throw new ConflictException('listing.image_limit_reached');
    const assets: StoredImage[] = [];
    try {
      for (const file of files) assets.push(await media.storeImage(file, { folder: `vehicle-${id}`, maxBytes: 8 * 1024 * 1024 }));
      const images = await this.prisma.$transaction(async (tx) => {
        const rows = [];
        for (let index = 0; index < assets.length; index += 1) rows.push(await tx.vehicleImage.create({ data: {
          vehicleId: id, category: 'gallery', storageKey: assets[index].storageKey,
          thumbnailKey: assets[index].thumbnailUrl, sortOrder: vehicle.images.length + index,
        } }));
        await tx.auditLog.create({ data: { actorId: userId, action: 'user.listing_images.uploaded',
          entityType: 'Vehicle', entityId: id, after: { count: rows.length } } });
        return rows;
      });
      return images.map((image) => ({ id: image.id, url: image.thumbnailKey, sortOrder: image.sortOrder }));
    } catch (error) {
      await Promise.allSettled(assets.map((asset) => media.delete(asset.storageKey)));
      throw error;
    }
  }

  async submitOwnListing(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id, ownerUserId: userId, ...individualListing },
        include: { images: true },
      });
      if (!vehicle) throw new NotFoundException('vehicle.not_found');
      if (!['Draft', 'Rejected'].includes(vehicle.approvalStatus)) throw new ConflictException('listing.invalid_status');
      if (vehicle.images.length < 1) throw new BadRequestException('listing.image_required');
      const changed = await tx.vehicle.updateMany({ where: { id, approvalStatus: vehicle.approvalStatus }, data: { approvalStatus: ApprovalStatus.PendingReview } });
      if (changed.count !== 1) throw new ConflictException('listing.concurrent_submission');
      await tx.auditLog.create({ data: { actorId: userId, action: 'user.listing.submitted', entityType: 'Vehicle', entityId: id } });
      return { id, status: ApprovalStatus.PendingReview };
    });
  }

  async listAdminVehicles(query: AdminVehicleQueryDto) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...notDeleted,
        approvalStatus: query.status,
        cityId: query.cityId,
        make: query.make ? { contains: query.make.trim() } : undefined,
        model: query.model ? { contains: query.model.trim() } : undefined,
        quickSalePrice:
          query.maxPriceLyd === undefined
            ? undefined
            : { lte: this.lydToStoredMoney(query.maxPriceLyd) },
      },
      include: vehicleInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return vehicles.map((vehicle) => this.serializeVehicle(vehicle));
  }

  async createVehicle(input: CreateVehicleDto, ownership?: { ownerUserId?: string; dealerId?: string }) {
    await this.assertLocation(input.cityId, input.regionId);
    const lotNumber = input.lotNumber?.trim() || (await this.nextLotNumber());

    const vehicle = await this.prisma.vehicle.create({
      data: {
        lotNumber,
        ownerUserId: ownership?.ownerUserId,
        dealerId: ownership?.dealerId,
        make: input.make.trim(),
        model: input.model.trim(),
        category: input.category ?? VehicleCategory.Car,
        trim: input.trim?.trim() || null,
        year: input.year,
        cityId: input.cityId,
        regionId: input.regionId || null,
        exteriorColor: input.exteriorColor?.trim() || null,
        fuelType: input.fuelType?.trim() || null,
        transmission: input.transmission?.trim() || null,
        mileageKm: input.mileageKm,
        bodyType: input.bodyType?.trim() || null,
        address: input.address?.trim() || null,
        saleType: input.saleType,
        condition: input.condition,
        quickSalePrice:
          input.priceLyd === undefined ? null : this.lydToStoredMoney(input.priceLyd),
        approvalStatus: ApprovalStatus.Draft,
      },
      include: vehicleInclude,
    });
    const serialized = this.serializeVehicle(vehicle);
    await this.audit('admin.vehicle.created', 'Vehicle', vehicle.id, null, serialized);
    return serialized;
  }

  async listDealerVehicles(dealerId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { dealerId, ...notDeleted }, include: vehicleInclude, orderBy: { createdAt: 'desc' }, take: 300,
    });
    return vehicles.map((vehicle) => this.serializeVehicle(vehicle));
  }

  async updateDealerVehicle(dealerId: string, id: string, input: UpdateVehicleDto) {
    const owned = await this.prisma.vehicle.findFirst({ where: { id, dealerId, ...notDeleted } });
    if (!owned) throw new NotFoundException('vehicle.not_found');
    if (['Published', 'Archived'].includes(owned.approvalStatus)) throw new ConflictException('vehicle.admin_review_required');
    return this.updateVehicle(id, input);
  }

  async submitDealerVehicle(dealerId: string, id: string) {
    const owned = await this.prisma.vehicle.findFirst({ where: { id, dealerId, ...notDeleted } });
    if (!owned) throw new NotFoundException('vehicle.not_found');
    if (!['Draft', 'Rejected'].includes(owned.approvalStatus)) throw new ConflictException('vehicle.invalid_submission_state');
    return this.updateVehicle(id, { approvalStatus: ApprovalStatus.PendingReview });
  }

  async updateVehicle(id: string, input: UpdateVehicleDto) {
    const before = await this.prisma.vehicle.findUnique({
      where: { id },
      include: vehicleInclude,
    });
    if (!before || before.deletedAt) throw new NotFoundException('vehicle.not_found');
    if (before.auctionLocked) throw new ConflictException('vehicle.locked_by_auction');

    if (input.cityId || input.regionId) {
      await this.assertLocation(input.cityId ?? before.cityId ?? '', input.regionId ?? before.regionId ?? undefined);
    }

    const vehicle = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.vehicle.updateMany({ where: { id, auctionLocked: false, auctionVersion: before.auctionVersion }, data: { auctionVersion: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('vehicle.concurrent_update');
      return tx.vehicle.update({
      where: { id },
      data: {
        make: input.make?.trim(),
        model: input.model?.trim(),
        category: input.category,
        trim: input.trim?.trim(),
        year: input.year,
        cityId: input.cityId,
        regionId: input.regionId,
        exteriorColor: input.exteriorColor?.trim(),
        fuelType: input.fuelType?.trim(),
        transmission: input.transmission?.trim(),
        mileageKm: input.mileageKm,
        bodyType: input.bodyType?.trim(),
        address: input.address?.trim(),
        saleType: input.saleType,
        condition: input.condition,
        quickSalePrice:
          input.priceLyd === undefined ? undefined : this.lydToStoredMoney(input.priceLyd),
        approvalStatus: input.approvalStatus,
        publishedAt:
          input.approvalStatus === ApprovalStatus.Published ? before.publishedAt ?? new Date() : undefined,
      },
      include: vehicleInclude,
      });
    });
    const serializedBefore = this.serializeVehicle(before);
    const serializedAfter = this.serializeVehicle(vehicle);
    await this.audit('admin.vehicle.updated', 'Vehicle', id, serializedBefore, serializedAfter);
    return serializedAfter;
  }

  async publishVehicle(id: string) {
    const listing = await this.prisma.vehicle.findUnique({ where: { id }, include: { images: true } });
    if (!listing) throw new NotFoundException('vehicle.not_found');
    if (listing.ownerUserId && !listing.dealerId && listing.saleType !== 'Auction') {
      if (listing.approvalStatus !== ApprovalStatus.PendingReview) throw new ConflictException('listing.not_pending_review');
      if (!listing.images.length) throw new ConflictException('listing.image_required');
    }
    return this.updateVehicle(id, { approvalStatus: ApprovalStatus.Published });
  }

  async archiveVehicle(id: string) {
    const before = await this.prisma.vehicle.findUnique({
      where: { id },
      include: vehicleInclude,
    });
    if (!before || before.deletedAt) throw new NotFoundException('vehicle.not_found');
    if (before.auctionLocked) throw new ConflictException('vehicle.locked_by_auction');

    const archived = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.vehicle.updateMany({ where: { id, auctionLocked: false, auctionVersion: before.auctionVersion }, data: { auctionVersion: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('vehicle.concurrent_update');
      return tx.vehicle.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.Archived, deletedAt: new Date() },
      include: vehicleInclude,
      });
    });
    const serialized = this.serializeVehicle(archived);
    await this.audit(
      'admin.vehicle.archived',
      'Vehicle',
      id,
      this.serializeVehicle(before),
      serialized,
    );
    return serialized;
  }

  async getAdminOverview() {
    const [vehicles, publishedVehicles, pendingVehicles, users, dealers, technicians, liveAuctions, recentVehicles] =
      await Promise.all([
        this.prisma.vehicle.count({ where: { ...notDeleted } }),
        this.prisma.vehicle.count({
          where: { ...notDeleted, approvalStatus: ApprovalStatus.Published },
        }),
        this.prisma.vehicle.count({
          where: { ...notDeleted, approvalStatus: ApprovalStatus.PendingReview },
        }),
        this.prisma.user.count({ where: { ...notDeleted } }),
        this.prisma.dealer.count({ where: { ...notDeleted } }),
        this.prisma.technician.count(),
        this.prisma.auction.count({ where: { status: 'Live' } }),
        this.prisma.vehicle.findMany({
          where: { ...notDeleted },
          include: vehicleInclude,
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    return {
      counts: { vehicles, publishedVehicles, pendingVehicles, users, dealers, technicians, liveAuctions },
      recentVehicles: recentVehicles.map((vehicle) => this.serializeVehicle(vehicle)),
    };
  }

  async getPublicHome() {
    const [cities, vehicles, liveAuction] = await Promise.all([
      this.getCities(),
      this.listPublicVehicles({}),
      this.prisma.auction.findFirst({
        where: { status: 'Live', endsAt: { gt: new Date() } },
        include: { vehicle: { include: { city: true } } },
        orderBy: { endsAt: 'asc' },
      }),
    ]);

    return {
      cities,
      vehicles: vehicles.slice(0, 12),
      liveAuction: liveAuction
        ? {
            id: liveAuction.id,
            vehicle: `${liveAuction.vehicle.make} ${liveAuction.vehicle.model} ${liveAuction.vehicle.year}`,
            lotNumber: liveAuction.vehicle.lotNumber,
            city: liveAuction.vehicle.city?.nameAr ?? null,
            currentBidLyd: this.storedMoneyToLyd(
              liveAuction.currentBidAmount ?? liveAuction.startingPrice,
            ),
            bidCount: liveAuction.bidCount,
            endsAt: liveAuction.endsAt,
          }
        : null,
    };
  }

  private serializeVehicle(vehicle: VehicleWithRelations) {
    const auction = vehicle.auctions[0];
    return {
      id: vehicle.id,
      lotNumber: vehicle.lotNumber,
      make: vehicle.make,
      model: vehicle.model,
      category: vehicle.category ?? VehicleCategory.Car,
      trim: vehicle.trim,
      year: vehicle.year,
      exteriorColor: vehicle.exteriorColor,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      mileageKm: vehicle.mileageKm,
      bodyType: vehicle.bodyType,
      address: vehicle.address,
      saleType: vehicle.saleType,
      condition: vehicle.condition,
      approvalStatus: vehicle.approvalStatus,
      city: vehicle.city ? { id: vehicle.city.id, nameAr: vehicle.city.nameAr } : null,
      region: vehicle.region ? { id: vehicle.region.id, nameAr: vehicle.region.nameAr } : null,
      dealer: vehicle.dealer,
      priceLyd:
        vehicle.quickSalePrice === null ? null : this.storedMoneyToLyd(vehicle.quickSalePrice),
      imageUrl: vehicle.images[0]?.thumbnailKey ?? vehicle.images[0]?.storageKey ?? null,
      images: vehicle.images.map((image) => ({
        id: image.id,
        category: image.category,
        url: image.thumbnailKey ?? image.storageKey,
        sortOrder: image.sortOrder,
      })),
      auction: auction
        ? {
            id: auction.id,
            status: auction.status,
            currentBidLyd: this.storedMoneyToLyd(
              auction.currentBidAmount ?? auction.startingPrice,
            ),
            bidCount: auction.bidCount,
            endsAt: auction.endsAt,
          }
        : null,
      viewCount: vehicle.viewCount,
      createdAt: vehicle.createdAt,
      publishedAt: vehicle.publishedAt,
    };
  }

  private lydToStoredMoney(amount: number) {
    return BigInt(Math.round(amount * 1000));
  }

  private storedMoneyToLyd(amount: bigint) {
    return Number(amount) / 1000;
  }

  private async nextLotNumber() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `BNG-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const exists = await this.prisma.vehicle.findUnique({ where: { lotNumber: candidate } });
      if (!exists) return candidate;
    }
    return `BNG-${Date.now()}`;
  }

  private async assertLocation(cityId: string, regionId?: string) {
    const city = await this.prisma.city.findFirst({ where: { id: cityId, isActive: true } });
    if (!city) throw new BadRequestException('city.invalid');
    if (!regionId) return;

    const region = await this.prisma.region.findFirst({
      where: { id: regionId, cityId, isActive: true },
    });
    if (!region) throw new BadRequestException('region.invalid');
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    before: object | null,
    after: object,
  ) {
    await this.prisma.auditLog.create({
      data: { action, entityType, entityId, before: before ?? undefined, after },
    });
  }
}
