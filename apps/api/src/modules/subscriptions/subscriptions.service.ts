import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toLyd } from '../../common/money';
import { readDealerPlanFeatures } from '../dealers/dealer-plan-capabilities';
import { SettingsService } from '../settings/settings.service';
import { activateMemberSubscription } from './subscription-state';
import { ManageMemberSubscriptionDto, RequestSubscriptionDto } from './subscriptions.dto';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}
  async plans() {
    const plans = await this.prisma.dealerPlan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } });
    return plans.filter((p) => this.eligible(p.features)).map((p) => ({ id: p.id, name: p.name, priceLyd: toLyd(p.price),
      currency: p.currency, durationDays: p.durationDays, auctionLimit: p.auctionLimit, ...readDealerPlanFeatures(p.features) }));
  }
  private eligible(features: unknown) {
    const f = readDealerPlanFeatures(features);
    return ['Customer', 'Both'].includes(f.audience) && f.permissions.includes('CAN_CREATE_AUCTION');
  }
  async mine(userId: string) {
    const subscriptions = await this.prisma.memberSubscription.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { required: await this.settings.get<boolean>('auction.publisher_subscription_required'),
      plans: await this.plans(), subscriptions: subscriptions.map((s) => ({ ...s, snapshot: s.snapshot,
        plan: { id: s.plan.id, name: s.plan.name, auctionLimit: s.plan.auctionLimit, priceLyd: toLyd(s.plan.price) } })) };
  }
  async request(userId: string, input: RequestSubscriptionDto) {
    const existing = await this.prisma.memberSubscription.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || existing.planId !== input.planId) throw new ConflictException('subscription.idempotency_conflict');
      const order = await this.prisma.order.findFirst({ where: { userId, type: 'MemberSubscription', referenceId: existing.id } });
      return { subscriptionId: existing.id, order: order && { id: order.id, status: order.status, totalLyd: toLyd(order.total) }, reused: true };
    }
    const plan = await this.prisma.dealerPlan.findUnique({ where: { id: input.planId } });
    if (!plan?.isActive || !this.eligible(plan.features)) throw new BadRequestException('subscription.plan_unavailable');
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.memberSubscription.create({ data: { userId, planId: plan.id, idempotencyKey: input.idempotencyKey,
        snapshot: { name: plan.name, durationDays: plan.durationDays, priceMilli: plan.price.toString(), currency: plan.currency } } });
      const order = await tx.order.create({ data: { userId, type: 'MemberSubscription', status: plan.price === 0n ? 'Paid' : 'PaymentPending',
        subtotal: plan.price, total: plan.price, currency: plan.currency, referenceId: subscription.id, expiresAt: plan.price === 0n ? null : new Date(Date.now() + 86400000) } });
      if (plan.price === 0n) await activateMemberSubscription(tx, subscription.id, userId);
      await tx.auditLog.create({ data: { actorId: userId, action: 'subscription.requested', entityType: 'MemberSubscription', entityId: subscription.id,
        after: { planId: plan.id, orderId: order.id, amountMilli: plan.price.toString() } } });
      return { subscriptionId: subscription.id, order: { id: order.id, status: order.status, totalLyd: toLyd(order.total) }, reused: false };
    });
  }
  async consumeAuction(tx: Prisma.TransactionClient, userId: string) {
    if (!await this.settings.get<boolean>('auction.publisher_subscription_required')) return;
    const now = new Date();
    const s = await tx.memberSubscription.findFirst({ where: { userId, status: 'Active', startsAt: { lte: now }, endsAt: { gt: now } }, include: { plan: true }, orderBy: { startsAt: 'desc' } });
    if (!s) throw new ForbiddenException('subscription.active_publishing_subscription_required');
    const features = readDealerPlanFeatures(s.plan.features);
    const disabled = await tx.planCapability.findUnique({ where: { code: 'CAN_CREATE_AUCTION' } });
    const override = await tx.capabilityOverride.findFirst({ where: { subjectType: 'User', subjectId: userId, capability: 'CAN_CREATE_AUCTION' } });
    if (disabled?.isActive === false || override?.effect === 'Deny' ||
      (!features.permissions.includes('CAN_CREATE_AUCTION') && override?.effect !== 'Allow')) throw new ForbiddenException('subscription.auction_permission_required');
    const limit = s.plan.auctionLimit;
    if (limit !== null && s.usedAuctions >= limit) throw new ConflictException('subscription.auction_quota_exhausted');
    const changed = await tx.memberSubscription.updateMany({ where: { id: s.id, version: s.version, status: 'Active', endsAt: { gt: now },
      ...(limit === null ? {} : { usedAuctions: { lt: limit } }) }, data: { usedAuctions: { increment: 1 }, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictException('subscription.concurrent_quota_update');
  }
  async adminList() {
    const items = await this.prisma.memberSubscription.findMany({ include: { user: { select: { id: true, fullName: true, phone: true } }, plan: true }, orderBy: { createdAt: 'desc' }, take: 500 });
    return items.map((s) => ({ ...s, plan: { id: s.plan.id, name: s.plan.name, auctionLimit: s.plan.auctionLimit } }));
  }
  async manage(input: ManageMemberSubscriptionDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      let s = input.subscriptionId ? await tx.memberSubscription.findFirst({ where: { id: input.subscriptionId, userId: input.userId } }) : null;
      if (input.action === 'activate') {
        const plan = input.planId && await tx.dealerPlan.findUnique({ where: { id: input.planId } });
        if (!plan || !plan.isActive || !this.eligible(plan.features)) throw new BadRequestException('subscription.plan_unavailable');
        if (!await tx.user.findUnique({ where: { id: input.userId } })) throw new NotFoundException('user.not_found');
        const pending = await tx.memberSubscription.create({ data: { userId: input.userId, planId: plan.id, idempotencyKey: randomUUID(), snapshot: { durationDays: plan.durationDays, name: plan.name, source: 'admin_grant' } } });
        await activateMemberSubscription(tx, pending.id, input.userId);
        s = pending;
      } else {
        if (!s) throw new NotFoundException('subscription.not_found');
        if (input.action === 'extend' && !['Active', 'Expired', 'Suspended'].includes(s.status)) throw new ConflictException('subscription.cannot_extend');
        if (input.action === 'suspend' && s.status !== 'Active') throw new ConflictException('subscription.cannot_suspend');
        if (input.action === 'extend' && (!input.value || !s.endsAt)) throw new BadRequestException('subscription.extension_required');
        if (input.action === 'resume' && (s.status !== 'Suspended' || !s.endsAt || s.endsAt <= new Date())) throw new ConflictException('subscription.cannot_resume');
        const changed = await tx.memberSubscription.updateMany({ where: { id: s.id, version: s.version }, data: {
          ...(input.action === 'extend' ? { endsAt: new Date(Math.max(Date.now(), s.endsAt!.getTime()) + input.value! * 86400000), status: 'Active' as const } : {}),
          ...(input.action === 'set_usage' ? { usedAuctions: input.value ?? 0 } : {}),
          ...(input.action === 'suspend' ? { status: 'Suspended' as const } : {}),
          ...(input.action === 'resume' ? { status: 'Active' as const } : {}),
          ...(input.action === 'cancel' ? { status: 'Cancelled' as const } : {}), version: { increment: 1 },
        } });
        if (!changed.count) throw new ConflictException('subscription.concurrent_update');
      }
      await tx.auditLog.create({ data: { actorId, action: `admin.subscription.${input.action}`, entityType: 'MemberSubscription', entityId: s.id,
        before: { status: s.status, usedAuctions: s.usedAuctions }, after: { reason: input.reason, value: input.value ?? null } } });
      await tx.notification.create({ data: { userId: input.userId, title: 'تحديث اشتراك النشر', body: input.reason, data: { type: 'subscription_updated', route: '/subscriptions' } } });
      return { success: true, id: s.id };
    });
  }
}
