import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DealerStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { toLyd, toMilli } from '../../common/money';
import { notDeleted } from '../../common/mongo-filters';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CatalogService } from '../catalog/catalog.service';
import { CreateVehicleDto, UpdateVehicleDto } from '../catalog/dto/catalog.dto';
import { ImageUpload, MediaStorageService, StoredImage } from '../media/media-storage.service';
import {
  DealerPlanCapability,
  dealerPlanCapabilities,
  readDealerPlanFeatures,
} from './dealer-plan-capabilities';
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
  UpdateOwnDealerDto,
} from './dto/dealer.dto';

const dealerInclude = {
  owner: { select: { id: true, fullName: true, phone: true, status: true, lastLoginAt: true } },
  city: { select: { id: true, nameAr: true } },
  region: { select: { id: true, nameAr: true } },
  subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' as const } },
  _count: { select: { vehicles: true, staff: true, reviews: true } },
};

@Injectable()
export class DealersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly media: MediaStorageService,
  ) {}

  async listPlans(publicOnly = true) {
    const plans = await this.prisma.dealerPlan.findMany({
      where: publicOnly ? { isActive: true } : undefined,
      orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    });
    return plans
      .map((plan) => this.serializePlan(plan))
      .filter((plan) => !publicOnly || plan.audience !== 'Customer');
  }

  async planCapabilities(activeOnly = true) {
    const stored = await this.prisma.planCapability.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
    const records = new Map(stored.map((item) => [item.code, item]));
    const builtIns = dealerPlanCapabilities
      .filter((item) => !records.has(item.code))
      .map((item) => ({ id: null, code: item.code, name: item.label, description: null, isActive: true }));
    return [...stored, ...builtIns].map((item) => ({ ...item, label: item.name }));
  }

  async savePlanCapability(existingCode: string | null, input: SavePlanCapabilityDto, actorId: string) {
    if (existingCode && existingCode !== input.code) throw new BadRequestException('dealer.capability_code_immutable');
    const before = await this.prisma.planCapability.findUnique({ where: { code: existingCode ?? input.code } });
    const saved = await this.prisma.$transaction(async (tx) => {
      const capability = await tx.planCapability.upsert({
        where: { code: existingCode ?? input.code },
        create: { code: input.code, name: input.name.trim(), description: input.description?.trim() || null, isActive: input.isActive },
        update: { name: input.name.trim(), description: input.description?.trim() || null, isActive: input.isActive },
      });
      await tx.auditLog.create({ data: {
        actorId,
        action: before ? 'admin.plan_capability.updated' : 'admin.plan_capability.created',
        entityType: 'PlanCapability', entityId: capability.id,
        before: before ? { code: before.code, name: before.name, isActive: before.isActive } : undefined,
        after: { code: capability.code, name: capability.name, isActive: capability.isActive },
      } });
      return capability;
    });
    return saved;
  }

  async capabilityOverrides(subjectType: string, subjectId: string) {
    await this.validateOverrideSubject(subjectType, subjectId);
    const [catalog, overrides, planPermissions] = await Promise.all([
      this.planCapabilities(false),
      this.prisma.capabilityOverride.findMany({ where: { subjectType, subjectId } }),
      this.subjectPlanPermissions(subjectType, subjectId),
    ]);
    const overrideMap = new Map(overrides.map((item) => [item.capability, item]));
    return catalog.map((capability) => {
      const override = overrideMap.get(capability.code);
      const planEnabled = planPermissions.includes(capability.code);
      const effective = capability.isActive && (override?.effect === 'Allow' || (override?.effect !== 'Deny' && planEnabled));
      return { ...capability, planEnabled, effect: override?.effect ?? 'Inherit', reason: override?.reason ?? null, effective };
    });
  }

  async saveCapabilityOverride(subjectType: string, subjectId: string, input: SaveCapabilityOverrideDto, actorId: string) {
    await this.validateOverrideSubject(subjectType, subjectId);
    const capability = (await this.planCapabilities(false)).find((item) => item.code === input.capability);
    if (!capability) throw new NotFoundException('dealer.capability_not_found');
    const identity = { subjectType_subjectId_capability: { subjectType, subjectId, capability: input.capability } };
    const before = await this.prisma.capabilityOverride.findUnique({ where: identity });
    const saved = await this.prisma.$transaction(async (tx) => {
      const result = input.effect === 'Inherit'
        ? (before ? await tx.capabilityOverride.delete({ where: identity }) : null)
        : await tx.capabilityOverride.upsert({
            where: identity,
            create: { subjectType, subjectId, capability: input.capability, effect: input.effect, reason: input.reason?.trim() || null, createdById: actorId },
            update: { effect: input.effect, reason: input.reason?.trim() || null, createdById: actorId },
          });
      await tx.auditLog.create({ data: {
        actorId, action: 'admin.capability_override.updated', entityType: 'CapabilityOverride',
        entityId: result?.id ?? before?.id, before: before ? { effect: before.effect, reason: before.reason } : undefined,
        after: input.effect === 'Inherit' ? { effect: 'Inherit' } : { effect: input.effect, reason: input.reason?.trim() || null },
      } });
      return result;
    });
    return { saved: Boolean(saved), effect: input.effect };
  }

  async savePlan(id: string | null, input: SaveDealerPlanDto, actorId: string) {
    const before = id ? await this.prisma.dealerPlan.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundException('dealer.plan_not_found');
    const activeCapabilities = new Set((await this.planCapabilities(true)).map((item) => item.code));
    if (input.permissions.some((permission) => !activeCapabilities.has(permission))) {
      throw new BadRequestException('dealer.plan_unknown_or_disabled_capability');
    }
    const data = {
      code: input.code,
      name: input.name.trim(),
      price: toMilli(input.priceLyd),
      currency: 'LYD',
      durationDays: input.durationDays,
      vehicleLimit: input.vehicleLimit ?? null,
      auctionLimit: input.auctionLimit ?? null,
      staffLimit: input.staffLimit ?? null,
      searchBoostEnabled: input.searchBoostEnabled,
      adsIncluded: input.adsIncluded,
      extraVehicleFee: input.extraVehicleFeeLyd ? toMilli(input.extraVehicleFeeLyd) : null,
      commissionRate: input.commissionRate ?? null,
      billingModel: input.billingModel,
      features: {
        description: input.description?.trim() || null,
        audience: input.audience,
        auctionVehicleLimit: input.auctionVehicleLimit ?? null,
        permissions: Array.from(new Set(input.permissions)),
      },
      isActive: input.isActive,
    };
    const plan = await this.prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.dealerPlan.update({ where: { id }, data })
        : await tx.dealerPlan.create({ data });
      await tx.auditLog.create({ data: {
        actorId,
        action: id ? 'admin.dealer_plan.updated' : 'admin.dealer_plan.created',
        entityType: 'DealerPlan', entityId: saved.id,
        before: before ? this.planAudit(before) : undefined,
        after: this.planAudit(saved),
      } });
      return saved;
    });
    return this.serializePlan(plan);
  }

  async archivePlan(id: string, actorId: string) {
    const before = await this.prisma.dealerPlan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('dealer.plan_not_found');
    const plan = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.dealerPlan.update({ where: { id }, data: { isActive: false } });
      await tx.auditLog.create({ data: { actorId, action: 'admin.dealer_plan.archived', entityType: 'DealerPlan', entityId: id,
        before: { isActive: before.isActive }, after: { isActive: false } } });
      return saved;
    });
    return this.serializePlan(plan);
  }

  async adminList() {
    const dealers = await this.prisma.dealer.findMany({
      where: { ...notDeleted }, include: dealerInclude, orderBy: { createdAt: 'desc' }, take: 300,
    });
    return dealers.map((dealer) => this.serializeDealer(dealer));
  }

  async adminCreate(input: AdminCreateDealerDto, actorId: string) {
    const phone = this.normalizePhone(input.phone);
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw new ConflictException('auth.phone_already_registered');
    }
    const [role, plan] = await Promise.all([
      this.prisma.role.findUnique({ where: { code: 'DEALER_OWNER' } }),
      input.planId ? this.prisma.dealerPlan.findUnique({ where: { id: input.planId } }) : null,
    ]);
    if (!role) throw new ConflictException('dealer.owner_role_missing');
    if (input.planId && !plan) throw new NotFoundException('dealer.plan_not_found');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: {
        phone, fullName: input.ownerName.trim(), passwordHash,
        status: 'Active', phoneVerifiedAt: now,
        roles: { create: { roleId: role.id } },
      } });
      const dealer = await tx.dealer.create({ data: {
        ownerUserId: user.id,
        name: input.name.trim(),
        slug: await this.uniqueSlug(tx, input.name),
        phone,
        cityId: input.cityId || null,
        regionId: input.regionId || null,
        address: input.address?.trim() || null,
        licenseNumber: input.licenseNumber?.trim() || null,
        status: input.status ?? DealerStatus.Verified,
        verifiedAt: (input.status ?? DealerStatus.Verified) === DealerStatus.Verified ? now : null,
      } });
      if (plan) {
        const active = input.activateSubscription === true;
        const subscription = await tx.dealerSubscription.create({ data: {
          dealerId: dealer.id, planId: plan.id,
          status: active ? SubscriptionStatus.Active : SubscriptionStatus.Pending,
          startsAt: active ? now : null,
          endsAt: active ? this.addDays(now, plan.durationDays) : null,
          activatedAt: active ? now : null,
          metadata: { source: 'admin_creation', paymentRequired: !active },
        } });
        if (!active) await tx.order.create({ data: {
          userId: user.id, type: 'DealerSubscription', status: 'PaymentPending',
          subtotal: plan.price, total: plan.price, currency: plan.currency,
          referenceId: subscription.id, expiresAt: this.addDays(now, 7),
          metadata: { dealerId: dealer.id, planId: plan.id, action: 'initial' },
        } });
      }
      await tx.auditLog.create({ data: {
        actorId, action: 'admin.dealer.created', entityType: 'Dealer', entityId: dealer.id,
        after: { name: dealer.name, phone, ownerUserId: user.id, status: dealer.status, planId: plan?.id ?? null },
      } });
      return dealer;
    });
    return this.adminGet(result.id);
  }

  async adminGet(id: string) {
    const dealer = await this.prisma.dealer.findFirst({ where: { id, ...notDeleted }, include: dealerInclude });
    if (!dealer) throw new NotFoundException('dealer.not_found');
    return this.serializeDealer(dealer);
  }

  async adminDetail(id: string) {
    const dealer = await this.prisma.dealer.findFirst({ where: { id, ...notDeleted }, include: dealerInclude });
    if (!dealer) throw new NotFoundException('dealer.not_found');
    const [vehicles, staff, reviews, orders, payments] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { dealerId: id, ...notDeleted }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { auctions: { orderBy: { createdAt: 'desc' }, take: 1, include: { result: true } } } }),
      this.prisma.dealerStaff.findMany({ where: { dealerId: id }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { user: { select: { id: true, fullName: true, phone: true, status: true, lastLoginAt: true } } } }),
      this.prisma.review.findMany({ where: { dealerId: id }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { reviewer: { select: { id: true, fullName: true, phone: true } } } }),
      this.prisma.order.findMany({ where: { userId: dealer.ownerUserId, type: { in: ['DealerSubscription', 'AuctionListingFee'] } },
        orderBy: { createdAt: 'desc' }, take: 100, include: { payments: { select: { id: true, status: true, provider: true, createdAt: true } } } }),
      this.prisma.payment.findMany({ where: { userId: dealer.ownerUserId }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, orderId: true, amount: true, currency: true, provider: true, status: true, createdAt: true } }),
    ]);
    const soldAuctions = vehicles.flatMap((vehicle) => vehicle.auctions).filter((auction) => auction.status === 'Sold' && auction.result?.finalAmount !== null);
    return {
      dealer: this.serializeDealer(dealer),
      stats: {
        vehicles: vehicles.length,
        publishedVehicles: vehicles.filter((vehicle) => vehicle.approvalStatus === 'Published').length,
        soldVehicles: soldAuctions.length,
        soldValueLyd: toLyd(soldAuctions.reduce((sum, auction) => sum + (auction.result?.finalAmount ?? 0n), 0n)),
        staff: staff.length,
      },
      vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, lotNumber: vehicle.lotNumber, make: vehicle.make, model: vehicle.model,
        year: vehicle.year, saleType: vehicle.saleType, approvalStatus: vehicle.approvalStatus, createdAt: vehicle.createdAt,
        auction: vehicle.auctions[0] ? { id: vehicle.auctions[0].id, status: vehicle.auctions[0].status,
          currentBidLyd: vehicle.auctions[0].currentBidAmount === null ? null : toLyd(vehicle.auctions[0].currentBidAmount),
          finalAmountLyd: vehicle.auctions[0].result?.finalAmount === null || vehicle.auctions[0].result?.finalAmount === undefined
            ? null : toLyd(vehicle.auctions[0].result!.finalAmount!) } : null })),
      staff: staff.map((member) => ({ id: member.id, title: member.title, status: member.status, createdAt: member.createdAt, user: member.user })),
      reviews: reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, isHidden: review.isHidden,
        moderationReason: review.moderationReason, createdAt: review.createdAt, reviewer: review.reviewer })),
      orders: orders.map((order) => ({ id: order.id, type: order.type, status: order.status, totalLyd: toLyd(order.total),
        currency: order.currency, referenceId: order.referenceId, createdAt: order.createdAt, expiresAt: order.expiresAt, payments: order.payments })),
      payments: payments.map((payment) => ({ id: payment.id, orderId: payment.orderId, amountLyd: toLyd(payment.amount),
        currency: payment.currency, provider: payment.provider, status: payment.status, createdAt: payment.createdAt })),
    };
  }

  async changeStatus(id: string, status: DealerStatus, actorId: string) {
    const before = await this.prisma.dealer.findFirst({ where: { id, ...notDeleted } });
    if (!before) throw new NotFoundException('dealer.not_found');
    const dealer = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.dealer.update({ where: { id }, data: {
        status, verifiedAt: status === DealerStatus.Verified ? before.verifiedAt ?? new Date() : before.verifiedAt,
      } });
      await tx.auditLog.create({ data: { actorId, action: 'admin.dealer.status_changed', entityType: 'Dealer', entityId: id,
        before: { status: before.status }, after: { status } } });
      return saved;
    });
    return { id: dealer.id, status: dealer.status, verifiedAt: dealer.verifiedAt };
  }

  async manageSubscription(dealerId: string, input: ManageDealerSubscriptionDto, actorId: string) {
    const dealer = await this.prisma.dealer.findFirst({ where: { id: dealerId, ...notDeleted } });
    if (!dealer) throw new NotFoundException('dealer.not_found');
    const now = new Date();
    const current = await this.prisma.dealerSubscription.findFirst({
      where: { dealerId, status: SubscriptionStatus.Active, startsAt: { lte: now }, endsAt: { gt: now } },
      include: { plan: true }, orderBy: { endsAt: 'desc' },
    });
    if (input.action === 'remind') {
      await this.prisma.$transaction(async (tx) => {
        await tx.notification.create({ data: { userId: dealer.ownerUserId, title: 'تذكير باشتراك المعرض',
          body: current?.endsAt ? `ينتهي اشتراك معرضك بتاريخ ${current.endsAt.toISOString()}.` : 'لا يوجد اشتراك نشط لمعرضك حالياً.',
          data: { type: 'dealer_subscription_reminder', dealerId } } });
        await tx.auditLog.create({ data: { actorId, action: 'admin.dealer_subscription.reminded', entityType: 'Dealer', entityId: dealerId } });
      });
      return { reminded: true };
    }
    if (['extend', 'suspend', 'cancel'].includes(input.action) && !current) {
      throw new ConflictException('dealer.active_subscription_required');
    }
    if (input.action === 'extend') {
      const days = input.days ?? current!.plan.durationDays;
      const subscription = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.dealerSubscription.update({ where: { id: current!.id }, data: { endsAt: this.addDays(current!.endsAt!, days) } });
        await tx.auditLog.create({ data: { actorId, action: 'admin.dealer_subscription.extended', entityType: 'DealerSubscription', entityId: saved.id,
          before: { endsAt: current!.endsAt!.toISOString() }, after: { endsAt: saved.endsAt!.toISOString(), days } } });
        return saved;
      });
      return this.adminGet(dealerId).then((result) => ({ subscription, dealer: result }));
    }
    if (input.action === 'suspend' || input.action === 'cancel') {
      const status = input.action === 'suspend' ? SubscriptionStatus.Suspended : SubscriptionStatus.Cancelled;
      await this.prisma.$transaction(async (tx) => {
        await tx.dealerSubscription.update({ where: { id: current!.id }, data: { status, cancelledAt: input.action === 'cancel' ? now : undefined } });
        await tx.auditLog.create({ data: { actorId, action: `admin.dealer_subscription.${input.action}`, entityType: 'DealerSubscription', entityId: current!.id,
          before: { status: current!.status }, after: { status } } });
      });
      return this.adminGet(dealerId);
    }
    if (!input.planId) throw new BadRequestException('dealer.plan_required');
    const plan = await this.prisma.dealerPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundException('dealer.plan_not_found');
    await this.prisma.$transaction(async (tx) => {
      if (current) await tx.dealerSubscription.update({ where: { id: current.id }, data: { status: 'Expired', endsAt: now } });
      const created = await tx.dealerSubscription.create({ data: {
        dealerId, planId: plan.id, status: 'Active', startsAt: now,
        endsAt: this.addDays(now, input.days ?? plan.durationDays), activatedAt: now,
        metadata: { source: 'admin', action: input.action },
      } });
      await tx.auditLog.create({ data: { actorId, action: `admin.dealer_subscription.${input.action}`, entityType: 'DealerSubscription', entityId: created.id,
        before: current ? { subscriptionId: current.id, planId: current.planId } : undefined,
        after: { dealerId, planId: plan.id, endsAt: created.endsAt!.toISOString() } } });
    });
    return this.adminGet(dealerId);
  }

  async publicList() {
    const dealers = await this.prisma.dealer.findMany({
      where: { ...notDeleted, status: DealerStatus.Verified },
      include: { city: { select: { nameAr: true } }, _count: { select: { vehicles: true, reviews: true } } },
      orderBy: [{ ratingAverage: 'desc' }, { createdAt: 'desc' }], take: 100,
    });
    return dealers.map((dealer) => ({ id: dealer.id, name: dealer.name, slug: dealer.slug, logoUrl: dealer.logoUrl,
      city: dealer.city?.nameAr ?? null, ratingAverage: dealer.ratingAverage, ratingCount: dealer.ratingCount,
      vehicleCount: dealer._count.vehicles, verified: Boolean(dealer.verifiedAt) }));
  }

  async publicDetail(id: string) {
    const dealer = await this.prisma.dealer.findFirst({ where: { id, ...notDeleted, status: DealerStatus.Verified },
      include: { city: true, region: true, reviews: { where: { isHidden: false }, include: { reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 } } });
    if (!dealer) throw new NotFoundException('dealer.not_found');
    return { id: dealer.id, name: dealer.name, slug: dealer.slug, logoUrl: dealer.logoUrl, coverUrl: dealer.coverUrl,
      city: dealer.city?.nameAr ?? null, region: dealer.region?.nameAr ?? null, address: dealer.address,
      verified: Boolean(dealer.verifiedAt), ratingAverage: dealer.ratingAverage, ratingCount: dealer.ratingCount,
      reviews: dealer.reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment,
        reviewerName: review.reviewer.fullName ?? 'مستخدم', createdAt: review.createdAt })) };
  }

  async review(dealerId: string, reviewerId: string, input: CreateDealerReviewDto) {
    if (!(await this.settings.get<boolean>('comments.enabled'))) throw new ForbiddenException('comments.disabled');
    const dealer = await this.prisma.dealer.findFirst({ where: { id: dealerId, ...notDeleted, status: DealerStatus.Verified }, include: { staff: true } });
    if (!dealer) throw new NotFoundException('dealer.not_found');
    if (dealer.ownerUserId === reviewerId || dealer.staff.some((item) => item.userId === reviewerId)) {
      throw new ForbiddenException('review.own_dealer_forbidden');
    }
    const completedPurchase = await this.prisma.auctionResult.findFirst({ where: {
      winnerId: reviewerId, status: 'Sold', auction: { vehicle: { dealerId } },
    } });
    const dealerVehicles = completedPurchase ? [] : await this.prisma.vehicle.findMany({ where: { dealerId }, select: { id: true } });
    const completedSale = completedPurchase ? true : await this.prisma.saleRequest.findFirst({ where: { requesterId: reviewerId, sellerId: dealer.ownerUserId, vehicleId: { in: dealerVehicles.map((v) => v.id) }, status: 'Completed' } });
    if (!completedSale) throw new ForbiddenException('review.completed_purchase_required');
    const existing = await this.prisma.review.findFirst({ where: { dealerId, reviewerId } });
    const review = existing
      ? await this.prisma.review.update({ where: { id: existing.id }, data: { rating: input.rating, comment: input.comment?.trim() || null } })
      : await this.prisma.review.create({ data: { dealerId, reviewerId, rating: input.rating, comment: input.comment?.trim() || null } });
    await this.recalculateRating(dealerId);
    await this.prisma.auditLog.create({ data: { actorId: reviewerId, action: existing ? 'dealer.review.updated' : 'dealer.review.created', entityType: 'Review', entityId: review.id,
      after: { dealerId, rating: review.rating } } });
    return review;
  }

  async listReviewsAdmin() {
    return this.prisma.review.findMany({ where: { dealerId: { not: null } },
      include: { dealer: { select: { id: true, name: true } }, reviewer: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' }, take: 300 });
  }

  async moderateReview(id: string, input: ModerateDealerReviewDto, actorId: string) {
    if ((input.rating !== undefined || input.comment !== undefined) && !input.reason?.trim()) throw new BadRequestException('review.edit_reason_required');
    const before = await this.prisma.review.findUnique({ where: { id } });
    if (!before?.dealerId) throw new NotFoundException('review.not_found');
    const review = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({ where: { id }, data: { isHidden: input.hidden,
        ...(input.rating !== undefined ? { rating: input.rating } : {}), ...(input.comment !== undefined ? { comment: input.comment.trim() } : {}),
        hiddenAt: input.hidden ? new Date() : null, moderationReason: input.hidden ? input.reason?.trim() || 'policy' : null } });
      await tx.auditLog.create({ data: { actorId, action: input.hidden ? 'admin.review.hidden' : 'admin.review.restored', entityType: 'Review', entityId: id,
        before: { isHidden: before.isHidden, rating: before.rating, comment: before.comment }, after: { isHidden: saved.isHidden, rating: saved.rating, comment: saved.comment, reason: input.reason ?? saved.moderationReason } } });
      return saved;
    });
    await this.recalculateRating(before.dealerId);
    return review;
  }

  async myDashboard(userId: string) {
    const dealer = await this.findOwnedDealer(userId);
    const now = new Date();
    const [orders, reviews, plans, vehicles] = await Promise.all([
      this.prisma.order.findMany({ where: { userId, type: 'DealerSubscription' }, orderBy: { createdAt: 'desc' }, take: 30,
        include: { payments: { select: { id: true, status: true, provider: true } } } }),
      this.prisma.review.findMany({ where: { dealerId: dealer.id, isHidden: false }, include: { reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.listPlans(),
      this.catalog.listDealerVehicles(dealer.id),
    ]);
    const current = dealer.subscriptions.find((item) => item.status === 'Active' && item.startsAt && item.startsAt <= now && item.endsAt && item.endsAt > now);
    const upcoming = dealer.subscriptions.find((item) => item.status === 'Active' && item.startsAt && item.startsAt > now);
    const currentSubscription = current ? this.serializeSubscription(current) : null;
    if (currentSubscription && current) {
      currentSubscription.plan.permissions = await this.effectivePlanPermissions(userId, dealer.id, current.plan.features);
    }
    return { dealer: this.serializeDealer(dealer), currentSubscription,
      upcomingSubscription: upcoming ? this.serializeSubscription(upcoming) : null, plans,
      orders: orders.map((order) => ({ id: order.id, status: order.status, totalLyd: toLyd(order.total), currency: order.currency,
        expiresAt: order.expiresAt, createdAt: order.createdAt, payments: order.payments })),
      vehicles,
      reviews: reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, reviewerName: review.reviewer.fullName ?? 'مستخدم', createdAt: review.createdAt })) };
  }

  async createVehicle(userId: string, input: CreateVehicleDto) {
    const { dealer, subscription } = await this.requireActiveSubscription(userId);
    await this.requirePlanCapability(userId, dealer.id, subscription.plan.features, 'CAN_CREATE_LISTING');
    if (subscription.plan.vehicleLimit !== null) {
      const used = await this.prisma.vehicle.count({ where: { dealerId: dealer.id, ...notDeleted } });
      if (used >= subscription.plan.vehicleLimit) throw new ConflictException('dealer.vehicle_limit_reached');
    }
    const vehicle = await this.catalog.createVehicle(input, { ownerUserId: userId, dealerId: dealer.id });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: 'dealer.vehicle.created', entityType: 'Vehicle', entityId: vehicle.id,
      after: { dealerId: dealer.id, subscriptionId: subscription.id } } });
    return vehicle;
  }

  async updateVehicle(userId: string, id: string, input: UpdateVehicleDto) {
    const dealer = await this.findOwnedDealer(userId);
    return this.catalog.updateDealerVehicle(dealer.id, id, input);
  }

  async uploadVehicleImages(userId: string, vehicleId: string, files: ImageUpload[], category?: string) {
    const dealer = await this.findOwnedDealer(userId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId: dealer.id, ...notDeleted },
      include: { images: true },
    });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    if (vehicle.auctionLocked || vehicle.approvalStatus === 'Archived') throw new ConflictException('vehicle.images_locked');
    if (!files?.length) throw new BadRequestException('media.image_required');
    if (vehicle.images.length + files.length > 24) throw new ConflictException('vehicle.image_limit_reached');
    const imageCategory = category?.trim() || 'gallery';
    if (!/^[\p{L}\p{N}_ -]{1,50}$/u.test(imageCategory)) throw new BadRequestException('vehicle.invalid_image_category');

    const assets: StoredImage[] = [];
    try {
      for (const file of files) {
        assets.push(await this.media.storeImage(file, { folder: `vehicle-${vehicle.id}`, maxBytes: 8 * 1024 * 1024 }));
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
          action: 'dealer.vehicle_images.uploaded',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          after: { count: images.length, provider: assets[0]?.provider, category: imageCategory },
        } });
        return images;
      });
      return created.map((image) => ({ id: image.id, category: image.category, url: image.thumbnailKey, sortOrder: image.sortOrder }));
    } catch (error) {
      await Promise.allSettled(assets.map((asset) => this.media.delete(asset.storageKey)));
      throw error;
    }
  }

  async deleteVehicleImage(userId: string, vehicleId: string, imageId: string) {
    const dealer = await this.findOwnedDealer(userId);
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, dealerId: dealer.id, ...notDeleted } });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    if (vehicle.auctionLocked || vehicle.approvalStatus === 'Archived') throw new ConflictException('vehicle.images_locked');
    const image = await this.prisma.vehicleImage.findFirst({ where: { id: imageId, vehicleId } });
    if (!image) throw new NotFoundException('vehicle.image_not_found');
    await this.media.delete(image.storageKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleImage.delete({ where: { id: image.id } });
      await tx.auditLog.create({ data: {
        actorId: userId,
        action: 'dealer.vehicle_image.deleted',
        entityType: 'Vehicle',
        entityId: vehicle.id,
        before: { imageId: image.id, storageKey: image.storageKey },
      } });
    });
    return { success: true };
  }

  async submitVehicle(userId: string, id: string) {
    const { dealer, subscription } = await this.requireActiveSubscription(userId);
    await this.requirePlanCapability(userId, dealer.id, subscription.plan.features, 'CAN_CREATE_LISTING');
    const vehicle = await this.catalog.submitDealerVehicle(dealer.id, id);
    await this.prisma.auditLog.create({ data: { actorId: userId, action: 'dealer.vehicle.submitted', entityType: 'Vehicle', entityId: id,
      after: { dealerId: dealer.id, status: 'PendingReview' } } });
    return vehicle;
  }

  async requestVehicleAuction(userId: string, vehicleId: string, input: DealerAuctionRequestDto) {
    const { dealer, subscription } = await this.requireActiveSubscription(userId);
    await this.requirePlanCapability(userId, dealer.id, subscription.plan.features, 'CAN_CREATE_AUCTION');
    const startsAt = new Date(input.startsAt);
    if (input.rollingRound && input.endsAt) throw new BadRequestException('auction.round_end_conflict');
    const roundSeconds = input.rollingRound ? await this.settings.get<number>('auction.round_seconds') : null;
    const endsAt = input.rollingRound ? new Date(startsAt.getTime() + roundSeconds! * 1000) : new Date(input.endsAt ?? NaN);
    if (startsAt <= new Date() || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new BadRequestException('auction.invalid_schedule');
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, dealerId: dealer.id, ...notDeleted } });
    if (!vehicle) throw new NotFoundException('vehicle.not_found');
    if (!['Draft', 'Rejected'].includes(vehicle.approvalStatus) || vehicle.auctionLocked) throw new ConflictException('auction_listing.invalid_vehicle_state');
    if (await this.prisma.order.findFirst({ where: { referenceId: vehicle.id, type: 'AuctionListingFee', status: { in: ['PaymentPending', 'Paid'] } } })) {
      throw new ConflictException('auction_listing.already_requested');
    }
    if (subscription.plan.auctionLimit !== null) {
      const dealerVehicleIds = (await this.prisma.vehicle.findMany({ where: { dealerId: dealer.id }, select: { id: true } })).map((item) => item.id);
      const requested = await this.prisma.order.count({ where: { type: 'AuctionListingFee', status: 'Paid', createdAt: { gte: subscription.startsAt! }, referenceId: { in: dealerVehicleIds } } });
      if (requested >= subscription.plan.auctionLimit) throw new ConflictException('dealer.auction_limit_reached');
    }
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { saleType: 'Auction', approvalStatus: 'PendingReview' } });
      const created = await tx.order.create({ data: { userId, type: 'AuctionListingFee', status: 'Paid', subtotal: 0n, total: 0n,
        currency: 'LYD', referenceId: vehicle.id, metadata: { startsAt: input.startsAt, endsAt: endsAt.toISOString(), rollingRound: input.rollingRound === true,
          startingPriceLyd: input.startingPriceLyd, bidIncrementLyd: input.bidIncrementLyd ?? null,
          reservePriceLyd: input.reservePriceLyd ?? null, dealerSubscriptionId: subscription.id } } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'dealer.auction_listing.requested', entityType: 'Order', entityId: created.id,
        after: { vehicleId, dealerId: dealer.id, subscriptionId: subscription.id } } });
      return created;
    });
    return { id: order.id, status: order.status, totalLyd: 0, vehicleId };
  }

  async updateOwn(userId: string, input: UpdateOwnDealerDto) {
    const dealer = await this.findOwnedDealer(userId);
    const saved = await this.prisma.dealer.update({ where: { id: dealer.id }, data: {
      name: input.name?.trim(), cityId: input.cityId, regionId: input.regionId,
      address: input.address?.trim(), licenseNumber: input.licenseNumber?.trim(),
      status: dealer.status === 'Verified' ? undefined : 'PendingReview',
    } });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: 'dealer.profile.updated', entityType: 'Dealer', entityId: dealer.id } });
    return saved;
  }

  async requestSubscription(userId: string, input: RequestDealerSubscriptionDto) {
    const dealer = await this.findOwnedDealer(userId);
    const plan = await this.prisma.dealerPlan.findFirst({ where: { id: input.planId, isActive: true } });
    if (!plan) throw new NotFoundException('dealer.plan_not_found');
    const now = new Date();
    const pending = await this.prisma.dealerSubscription.findFirst({ where: { dealerId: dealer.id, planId: plan.id, status: 'Pending' }, orderBy: { createdAt: 'desc' } });
    if (pending) {
      const order = await this.prisma.order.findFirst({ where: { referenceId: pending.id, type: 'DealerSubscription', status: 'PaymentPending', expiresAt: { gt: now } } });
      if (order) return { subscriptionId: pending.id, order: this.serializeOrder(order), reused: true };
    }
    const current = dealer.subscriptions.find((item) => item.status === 'Active' && item.startsAt && item.startsAt <= now && item.endsAt && item.endsAt > now);
    const renewal = current?.planId === plan.id;
    const startsAt = renewal && current?.endsAt ? current.endsAt : now;
    const endsAt = this.addDays(startsAt, plan.durationDays);
    const paid = plan.price === 0n;
    const result = await this.prisma.$transaction(async (tx) => {
      if (paid && current && !renewal) await tx.dealerSubscription.update({ where: { id: current.id }, data: { status: 'Expired', endsAt: now } });
      const subscription = await tx.dealerSubscription.create({ data: {
        dealerId: dealer.id, planId: plan.id, status: paid ? 'Active' : 'Pending', startsAt, endsAt,
        activatedAt: paid ? now : null, metadata: { source: 'dealer_portal', action: renewal ? 'renewal' : current ? 'change' : 'initial' },
      } });
      const order = await tx.order.create({ data: {
        userId, type: 'DealerSubscription', status: paid ? 'Paid' : 'PaymentPending', subtotal: plan.price, total: plan.price,
        currency: plan.currency, referenceId: subscription.id, expiresAt: paid ? null : this.addDays(now, 7),
        metadata: { dealerId: dealer.id, planId: plan.id, action: renewal ? 'renewal' : current ? 'change' : 'initial' },
      } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'dealer.subscription.requested', entityType: 'DealerSubscription', entityId: subscription.id,
        after: { planId: plan.id, orderId: order.id, totalMilli: plan.price.toString() } } });
      return { subscription, order };
    });
    return { subscriptionId: result.subscription.id, order: this.serializeOrder(result.order), reused: false };
  }

  private async findOwnedDealer(userId: string) {
    const dealer = await this.prisma.dealer.findFirst({ where: { ownerUserId: userId, ...notDeleted }, include: dealerInclude });
    if (!dealer) throw new ForbiddenException('dealer.owner_account_required');
    return dealer;
  }

  private async requireActiveSubscription(userId: string) {
    const dealer = await this.findOwnedDealer(userId);
    if (dealer.status !== DealerStatus.Verified) throw new ForbiddenException('dealer.verification_required');
    const now = new Date();
    const subscription = dealer.subscriptions.find((item) => item.status === 'Active' && item.startsAt && item.startsAt <= now && item.endsAt && item.endsAt > now);
    if (!subscription) throw new ForbiddenException('dealer.active_subscription_required');
    return { dealer, subscription };
  }

  private async recalculateRating(dealerId: string) {
    const rating = await this.prisma.review.aggregate({ where: { dealerId, isHidden: false }, _avg: { rating: true }, _count: { rating: true } });
    await this.prisma.dealer.update({ where: { id: dealerId }, data: { ratingAverage: rating._avg.rating ?? 0, ratingCount: rating._count.rating } });
  }

  private serializeDealer(dealer: Prisma.DealerGetPayload<{ include: typeof dealerInclude }>) {
    const now = new Date();
    const current = dealer.subscriptions.find((item) => item.status === 'Active' && item.startsAt && item.startsAt <= now && item.endsAt && item.endsAt > now);
    return { id: dealer.id, name: dealer.name, slug: dealer.slug, phone: dealer.phone, status: dealer.status,
      city: dealer.city, region: dealer.region, address: dealer.address, licenseNumber: dealer.licenseNumber,
      verifiedAt: dealer.verifiedAt, ratingAverage: dealer.ratingAverage, ratingCount: dealer.ratingCount,
      owner: dealer.owner, counts: dealer._count, currentSubscription: current ? this.serializeSubscription(current) : null,
      subscriptions: dealer.subscriptions.map((item) => this.serializeSubscription(item)), createdAt: dealer.createdAt };
  }

  private serializeSubscription(subscription: Prisma.DealerSubscriptionGetPayload<{ include: { plan: true } }>) {
    return { id: subscription.id, status: subscription.status, startsAt: subscription.startsAt, endsAt: subscription.endsAt,
      activatedAt: subscription.activatedAt, plan: this.serializePlan(subscription.plan), createdAt: subscription.createdAt };
  }

  private serializePlan(plan: { id: string; code: string; name: string; price: bigint; currency: string; durationDays: number;
    vehicleLimit: number | null; auctionLimit: number | null; staffLimit: number | null; searchBoostEnabled: boolean;
    adsIncluded: boolean; extraVehicleFee: bigint | null; commissionRate: number | null; billingModel: string; features: unknown; isActive: boolean }) {
    const features = readDealerPlanFeatures(plan.features);
    return { id: plan.id, code: plan.code, name: plan.name, description: features.description, audience: features.audience,
      permissions: features.permissions, auctionVehicleLimit: features.auctionVehicleLimit,
      priceLyd: toLyd(plan.price), currency: plan.currency,
      durationDays: plan.durationDays, vehicleLimit: plan.vehicleLimit, auctionLimit: plan.auctionLimit, staffLimit: plan.staffLimit,
      searchBoostEnabled: plan.searchBoostEnabled, adsIncluded: plan.adsIncluded,
      extraVehicleFeeLyd: plan.extraVehicleFee === null ? null : toLyd(plan.extraVehicleFee), commissionRate: plan.commissionRate,
      billingModel: plan.billingModel, features: plan.features, isActive: plan.isActive };
  }

  private async requirePlanCapability(userId: string, dealerId: string, features: unknown, capability: DealerPlanCapability) {
    const [catalog, overrides] = await Promise.all([
      this.prisma.planCapability.findUnique({ where: { code: capability } }),
      this.prisma.capabilityOverride.findMany({ where: {
        capability,
        OR: [{ subjectType: 'User', subjectId: userId }, { subjectType: 'Dealer', subjectId: dealerId }],
      } }),
    ]);
    if (catalog && !catalog.isActive) throw new ForbiddenException('dealer.capability_globally_disabled');
    let allowed = readDealerPlanFeatures(features).permissions.includes(capability);
    const userOverride = overrides.find((item) => item.subjectType === 'User');
    const dealerOverride = overrides.find((item) => item.subjectType === 'Dealer');
    for (const override of [userOverride, dealerOverride]) {
      if (override) allowed = override.effect === 'Allow';
    }
    if (!allowed) {
      throw new ForbiddenException('dealer.plan_permission_required');
    }
  }

  private async effectivePlanPermissions(userId: string, dealerId: string, features: unknown) {
    const [catalog, overrides] = await Promise.all([
      this.prisma.planCapability.findMany(),
      this.prisma.capabilityOverride.findMany({ where: {
        OR: [{ subjectType: 'User', subjectId: userId }, { subjectType: 'Dealer', subjectId: dealerId }],
      } }),
    ]);
    const disabled = new Set(catalog.filter((item) => !item.isActive).map((item) => item.code));
    const enabled = new Set(readDealerPlanFeatures(features).permissions.filter((code) => !disabled.has(code)));
    for (const subjectType of ['User', 'Dealer']) {
      for (const override of overrides.filter((item) => item.subjectType === subjectType)) {
        if (disabled.has(override.capability) || override.effect === 'Deny') enabled.delete(override.capability);
        else if (override.effect === 'Allow') enabled.add(override.capability);
      }
    }
    return [...enabled];
  }

  private async validateOverrideSubject(subjectType: string, subjectId: string) {
    if (subjectType === 'User') {
      if (!(await this.prisma.user.findUnique({ where: { id: subjectId }, select: { id: true } }))) {
        throw new NotFoundException('user.not_found');
      }
      return;
    }
    if (subjectType === 'Dealer') {
      if (!(await this.prisma.dealer.findUnique({ where: { id: subjectId }, select: { id: true } }))) {
        throw new NotFoundException('dealer.not_found');
      }
      return;
    }
    throw new BadRequestException('dealer.invalid_capability_subject');
  }

  private async subjectPlanPermissions(subjectType: string, subjectId: string) {
    const now = new Date();
    const dealer = subjectType === 'Dealer'
      ? await this.prisma.dealer.findUnique({ where: { id: subjectId }, include: { subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } } } })
      : await this.prisma.dealer.findUnique({ where: { ownerUserId: subjectId }, include: { subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } } } });
    const subscription = dealer?.subscriptions.find((item) => item.status === 'Active' && item.startsAt && item.startsAt <= now && item.endsAt && item.endsAt > now);
    return subscription ? readDealerPlanFeatures(subscription.plan.features).permissions : [];
  }

  private planAudit(plan: { code: string; name: string; price: bigint; durationDays: number; billingModel: string; isActive: boolean }): Prisma.InputJsonValue {
    return { code: plan.code, name: plan.name, priceMilli: plan.price.toString(), durationDays: plan.durationDays, billingModel: plan.billingModel, isActive: plan.isActive };
  }

  private serializeOrder(order: { id: string; status: string; total: bigint; currency: string; expiresAt: Date | null }) {
    return { id: order.id, status: order.status, totalLyd: toLyd(order.total), currency: order.currency, expiresAt: order.expiresAt };
  }

  private normalizePhone(value: string) {
    const compact = value.replace(/[\s()-]/g, '');
    return compact.startsWith('0') ? `+218${compact.slice(1)}` : compact;
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 86_400_000);
  }

  private async uniqueSlug(tx: Prisma.TransactionClient, name: string) {
    const base = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'dealer';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomBytes(3).toString('hex');
      const slug = `${base}-${suffix}`;
      if (!(await tx.dealer.findUnique({ where: { slug } }))) return slug;
    }
    return `${base}-${Date.now()}`;
  }
}
