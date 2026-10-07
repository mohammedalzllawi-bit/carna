import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { toLyd } from '../../common/money';
import { notDeleted } from '../../common/mongo-filters';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../settings/settings.service';
import { ChangePasswordDto, ContentDto, InspectionDto, ProfileSettingsDto, ReportDto, SaleRequestDto } from './workspace.dto';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService, private readonly settings: SettingsService) {}
  async availability(userId: string, status: string) {
    return this.prisma.$transaction(async (tx) => {
      const technician = await tx.technician.findUnique({ where: { userId } });
      if (!technician || technician.approvalStatus !== 'Published') throw new ForbiddenException('inspection.approved_technician_required');
      await tx.technician.update({ where: { id: technician.id }, data: { availabilityStatus: status } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'technician.availability.updated', entityType: 'Technician', entityId: technician.id,
        before: { availabilityStatus: technician.availabilityStatus }, after: { availabilityStatus: status } } });
      return { success: true };
    });
  }
  async requests(userId: string, admin = false) {
    const sales = await this.prisma.saleRequest.findMany({ where: admin ? {} : { OR: [{ requesterId: userId }, { sellerId: userId }] }, orderBy: { createdAt: 'desc' }, take: 200 });
    const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: sales.map((s) => s.vehicleId) } }, select: { id: true, make: true, model: true, year: true, dealerId: true } });
    const technician = await this.prisma.technician.findUnique({ where: { userId }, select: { id: true, name: true, availabilityStatus: true } });
    const inspections = await this.prisma.inspectionRequest.findMany({ where: admin ? {} : { OR: [{ requesterId: userId }, ...(technician ? [{ technicianId: technician.id }] : [])] },
      include: { vehicle: { select: { id: true, make: true, model: true, year: true } }, technician: { select: { id: true, name: true } }, report: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    const orders = await this.prisma.order.findMany({ where: { userId, type: 'InspectionFee', referenceId: { in: inspections.map((r) => r.id) } }, select: { id: true, referenceId: true, status: true } });
    return { technician, sales: sales.map((s) => ({ ...s, incoming: s.sellerId === userId, vehicle: vehicles.find((v) => v.id === s.vehicleId) })),
      inspections: inspections.map(({ price, ...r }) => ({ ...r, incoming: r.requesterId !== userId, priceLyd: toLyd(price), order: orders.find((o) => o.referenceId === r.id) ?? null })) };
  }
  async createSale(userId: string, input: SaleRequestDto) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: input.vehicleId, approvalStatus: 'Published', saleType: { not: 'Auction' }, ...notDeleted }, include: { dealer: { select: { ownerUserId: true } } } });
    if (!vehicle) throw new NotFoundException('vehicle.not_available');
    const sellerId = vehicle.dealer?.ownerUserId ?? vehicle.ownerUserId;
    if (!sellerId || sellerId === userId) throw new ForbiddenException('request.own_listing_forbidden');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.saleRequest.findUnique({ where: { vehicleId_requesterId: { vehicleId: vehicle.id, requesterId: userId } } });
      if (existing) return existing;
      const request = await tx.saleRequest.create({ data: { vehicleId: vehicle.id, requesterId: userId, sellerId, message: input.message?.trim() } });
      await tx.notification.create({ data: { userId: sellerId, title: 'طلب شراء جديد', body: `${vehicle.make} ${vehicle.model}`, data: { type: 'sale_request', route: '/requests' } } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'sale.requested', entityType: 'SaleRequest', entityId: request.id } });
      return request;
    });
  }
  async saleAction(id: string, userId: string, action: string) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.saleRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('request.not_found');
      const seller = r.sellerId === userId, buyer = r.requesterId === userId;
      if (!seller && !buyer) throw new ForbiddenException('request.not_yours');
      const next = seller && r.status === 'Pending' && action === 'accept' ? 'Accepted'
        : seller && r.status === 'Pending' && action === 'reject' ? 'Rejected'
        : seller && r.status === 'Accepted' && action === 'deliver' ? 'Delivered'
        : buyer && ['Pending', 'Accepted'].includes(r.status) && action === 'cancel' ? 'Cancelled'
        : buyer && r.status === 'Delivered' && action === 'complete' ? 'Completed' : null;
      if (!next) throw new ConflictException('request.invalid_transition');
      const claim = await tx.saleRequest.updateMany({ where: { id, version: r.version, status: r.status }, data: { status: next, version: { increment: 1 } } });
      if (!claim.count) throw new ConflictException('request.concurrent_update');
      if (next === 'Completed') {
        const vehicle = await tx.vehicle.updateMany({ where: { id: r.vehicleId, approvalStatus: 'Published', auctionLocked: false }, data: { approvalStatus: 'Archived' } });
        if (!vehicle.count) throw new ConflictException('sale.vehicle_already_sold');
        await tx.saleRequest.updateMany({ where: { vehicleId: r.vehicleId, id: { not: id }, status: { in: ['Pending', 'Accepted', 'Delivered'] } }, data: { status: 'Cancelled', version: { increment: 1 } } });
      }
      await tx.auditLog.create({ data: { actorId: userId, action: `sale.${next}`, entityType: 'SaleRequest', entityId: id, before: { status: r.status }, after: { status: next } } });
      await tx.notification.create({ data: { userId: seller ? r.requesterId : r.sellerId, title: 'تحديث طلب الشراء', body: next, data: { type: 'sale_request', route: '/requests' } } });
      return { id, status: next };
    });
  }
  async createInspection(userId: string, input: InspectionDto) {
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= new Date() || scheduledAt.getTime() > Date.now() + 90 * 86400000) throw new BadRequestException('inspection.invalid_schedule');
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.inspectionRequest.findUnique({ where: { id: input.idempotencyKey } });
      if (prior) {
        if (prior.requesterId !== userId || prior.vehicleId !== input.vehicleId || prior.technicianId !== input.technicianId) throw new ConflictException('request.idempotency_conflict');
        return { id: prior.id, reused: true };
      }
      const vehicle = await tx.vehicle.findFirst({ where: { id: input.vehicleId, approvalStatus: 'Published', ...notDeleted } });
      const tech = await tx.technician.findUnique({ where: { id: input.technicianId }, include: { user: { select: { status: true, deletedAt: true } } } });
      if (!vehicle || !tech || tech.approvalStatus !== 'Published' || tech.availabilityStatus !== 'available' || ['Banned', 'Suspended', 'Archived'].includes(tech.user.status) || tech.user.deletedAt) throw new BadRequestException('inspection.unavailable');
      if (tech.userId === userId) throw new ForbiddenException('inspection.self_request_forbidden');
      if (tech.cityId && tech.cityId !== vehicle.cityId) throw new BadRequestException('inspection.city_mismatch');
      const service = input.serviceId ? await tx.technicianService.findFirst({ where: { id: input.serviceId, technicianId: tech.id, isActive: true } }) : null;
      if (input.serviceId && !service) throw new BadRequestException('inspection.service_invalid');
      const price = service?.price ?? tech.basePrice;
      const r = await tx.inspectionRequest.create({ data: { id: input.idempotencyKey, requesterId: userId, vehicleId: vehicle.id, technicianId: tech.id, cityId: vehicle.cityId, inspectionType: service?.name ?? tech.specialty, price, scheduledAt, notes: input.notes?.trim(), status: price === 0n ? 'Paid' : 'PaymentPending' } });
      const order = await tx.order.create({ data: { userId, type: 'InspectionFee', status: price === 0n ? 'Paid' : 'PaymentPending', referenceId: r.id, currency: 'LYD', subtotal: price, total: price, expiresAt: scheduledAt } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'inspection.requested', entityType: 'InspectionRequest', entityId: r.id, after: { priceMilli: price.toString(), orderId: order.id } } });
      await tx.notification.create({ data: { userId: tech.userId, title: 'طلب فحص جديد', body: 'راجع الطلبات الواردة ومواعيدها.', data: { type: 'inspection_request', route: '/requests' } } });
      return { id: r.id, orderId: order.id, totalLyd: toLyd(price) };
    });
  }
  async inspectionAction(id: string, userId: string, action: string, report?: ReportDto) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.inspectionRequest.findUnique({ where: { id }, include: { technician: { select: { userId: true } } } });
      if (!r) throw new NotFoundException('inspection.not_found');
      const tech = r.technician?.userId === userId, buyer = r.requesterId === userId;
      if (!tech && !buyer) throw new ForbiddenException('inspection.not_yours');
      const next = tech && r.status === 'Paid' && action === 'accept' ? 'Scheduled'
        : tech && ['PaymentPending', 'Paid'].includes(r.status) && action === 'reject' ? 'RejectedByTechnician'
        : tech && r.status === 'Scheduled' && action === 'start' ? 'InProgress'
        : tech && r.status === 'InProgress' && report ? 'ReportSubmitted'
        : buyer && ['PaymentPending', 'Paid', 'Scheduled'].includes(r.status) && action === 'cancel' ? 'Cancelled'
        : buyer && r.status === 'ReportSubmitted' && action === 'complete' ? 'Completed' : null;
      if (!next) throw new ConflictException('inspection.invalid_transition');
      const claim = await tx.inspectionRequest.updateMany({ where: { id, version: r.version, status: r.status }, data: { status: next, version: { increment: 1 } } });
      if (!claim.count) throw new ConflictException('inspection.concurrent_update');
      if (report) await tx.inspectionReport.create({ data: { inspectionRequestId: id, technicianNotes: report.technicianNotes, recommendations: report.recommendations, overallScore: report.overallScore, engineCheck: { notes: report.engine }, transmissionCheck: { notes: report.transmission }, electricCheck: { notes: report.electric }, chassisCheck: { notes: report.chassis } } });
      if (next === 'Completed' && r.technicianId) await tx.technician.update({ where: { id: r.technicianId }, data: { completedInspections: { increment: 1 } } });
      if (['Cancelled', 'RejectedByTechnician'].includes(next)) {
        const order = await tx.order.findFirst({ where: { referenceId: id, userId: r.requesterId, type: 'InspectionFee' } });
        if (order?.status === 'Paid') {
          const refund = await tx.order.updateMany({ where: { id: order.id, version: order.version, status: 'Paid' }, data: { status: 'Refunded', version: { increment: 1 } } });
          if (!refund.count) throw new ConflictException('payment.concurrent_update');
          await this.wallet.post(tx, { userId: r.requesterId, amount: order.total, currency: order.currency, type: 'InspectionRefund', direction: 'Credit', referenceId: order.id, idempotencyKey: `inspection:${id}:refund` });
        } else if (order?.status === 'PaymentPending') await tx.order.updateMany({ where: { id: order.id, version: order.version, status: 'PaymentPending' }, data: { status: 'Cancelled', version: { increment: 1 } } });
      }
      await tx.auditLog.create({ data: { actorId: userId, action: `inspection.${next}`, entityType: 'InspectionRequest', entityId: id, before: { status: r.status }, after: { status: next } } });
      const recipient = tech ? r.requesterId : r.technician?.userId;
      if (recipient) await tx.notification.create({ data: { userId: recipient, title: next === 'ReportSubmitted' ? 'تقرير الفحص جاهز' : 'تحديث طلب الفحص', body: next, data: { type: 'inspection_updated', route: '/requests' } } });
      return { id, status: next };
    });
  }
  async preferences(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, phone: true, preferences: true, phoneVerifiedAt: true } });
    return { ...u, preferences: { pushEnabled: true, auctionNotifications: true, messageNotifications: true, ...(u.preferences && typeof u.preferences === 'object' && !Array.isArray(u.preferences) ? u.preferences : {}) } };
  }
  async savePreferences(userId: string, input: ProfileSettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const before = u.preferences && typeof u.preferences === 'object' && !Array.isArray(u.preferences) ? u.preferences : {};
      const { fullName, ...preferences } = input;
      await tx.user.update({ where: { id: userId }, data: { ...(fullName ? { fullName: fullName.trim() } : {}), preferences: { ...before, ...preferences } } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'account.settings.updated', entityType: 'User', entityId: userId, after: preferences } });
      return { success: true };
    });
  }
  async password(userId: string, input: ChangePasswordDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.passwordHash || !await argon2.verify(u.passwordHash, input.currentPassword)) throw new ForbiddenException('auth.invalid_credentials');
    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({ where: { id: userId, passwordHash: u.passwordHash }, data: { passwordHash } });
      if (!changed.count) throw new ConflictException('account.concurrent_update');
      await tx.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'account.password.changed', entityType: 'User', entityId: userId } });
    });
    return { success: true, loginRequired: true };
  }
  async watches(userId: string) {
    return this.prisma.watchlist.findMany({ where: { userId, auctionId: { not: null } }, select: { auctionId: true } });
  }
  async watch(userId: string, auctionId: string, enabled: boolean) {
    const auction = await this.prisma.auction.findFirst({ where: { id: auctionId, vehicle: { approvalStatus: 'Published', ...notDeleted } } });
    if (!auction) throw new NotFoundException('auction.not_found');
    const id = `auction:${userId}:${auctionId}`;
    if (enabled) await this.prisma.watchlist.upsert({ where: { id }, create: { id, userId, auctionId }, update: {} });
    else await this.prisma.watchlist.deleteMany({ where: { userId, auctionId } });
    return { enabled, reminderMinutes: await this.settings.get<number[]>('notifications.auction_reminder_minutes') };
  }
  async content(slug: string, locale = 'ar', admin = false) {
    const page = await this.prisma.page.findUnique({ where: { slug: `${slug}:${locale}` } });
    if (!page || (!admin && page.status !== 'Published')) throw new NotFoundException('content.not_published');
    return page;
  }
  async contentAdmin() { return this.prisma.page.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 }); }
  async reviewsAdmin() {
    return this.prisma.review.findMany({ include: { reviewer: { select: { fullName: true } }, dealer: { select: { name: true } }, technician: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  }
  async editReview(id: string, actorId: string, input: { rating: number; comment: string; hidden: boolean; reason: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.review.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('review.not_found');
      const after = await tx.review.update({ where: { id }, data: { rating: input.rating, comment: input.comment, isHidden: input.hidden, hiddenAt: input.hidden ? new Date() : null, moderationReason: input.reason } });
      const target = before.dealerId ? { dealerId: before.dealerId } : { technicianId: before.technicianId! };
      const totals = await tx.review.aggregate({ where: { ...target, isHidden: false }, _avg: { rating: true }, _count: { rating: true } });
      const rating = { ratingAverage: totals._avg.rating ?? 0, ratingCount: totals._count.rating };
      if (before.dealerId) await tx.dealer.update({ where: { id: before.dealerId }, data: rating });
      else if (before.technicianId) await tx.technician.update({ where: { id: before.technicianId }, data: rating });
      await tx.auditLog.create({ data: { actorId, action: 'admin.review.edited', entityType: 'Review', entityId: id, before: { rating: before.rating, comment: before.comment, hidden: before.isHidden }, after: { rating: after.rating, comment: after.comment, hidden: after.isHidden, reason: input.reason } } });
      return after;
    });
  }
  async saveContent(input: ContentDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const slug = `${input.slug}:${input.locale}`;
      const before = await tx.page.findUnique({ where: { slug } });
      const page = await tx.page.upsert({ where: { slug }, create: { slug, locale: input.locale, title: input.title, body: input.body, status: input.published ? 'Published' : 'Draft' }, update: { title: input.title, body: input.body, status: input.published ? 'Published' : 'Draft' } });
      if (input.published) {
        const last = await tx.term.findFirst({ where: { code: input.slug, locale: input.locale }, orderBy: { version: 'desc' } });
        await tx.term.updateMany({ where: { code: input.slug, locale: input.locale, isActive: true }, data: { isActive: false } });
        await tx.term.create({ data: { code: input.slug, locale: input.locale, title: input.title, body: input.body, version: (last?.version ?? 0) + 1, isActive: true } });
      }
      await tx.auditLog.create({ data: { actorId, action: 'admin.content.updated', entityType: 'Page', entityId: page.id, before: before ? { title: before.title, body: before.body, status: before.status } : undefined, after: { title: page.title, body: page.body, status: page.status } } });
      return page;
    });
  }
}
