import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentProvider, VerifyWebhookInput } from './payment-provider.interface';
import { NotConfiguredPaymentProvider } from './providers/not-configured.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { toLyd, toMilli } from '../../common/money';
import { activateMemberSubscription } from '../subscriptions/subscription-state';

const providerNames: Record<string, string> = {
  'yesser-pay': 'YesserPay',
  'masrafy-pay': 'Masrafy Pay',
  mobicash: 'MobiCash',
  'edfa3-li': 'ادفع لي',
  onepay: 'OnePay',
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}
  private readonly providers = new Map<string, PaymentProvider>([
    ['yesser-pay', new NotConfiguredPaymentProvider('yesser-pay')],
    ['masrafy-pay', new NotConfiguredPaymentProvider('masrafy-pay')],
    ['mobicash', new NotConfiguredPaymentProvider('mobicash')],
    ['edfa3-li', new NotConfiguredPaymentProvider('edfa3-li')],
    ['onepay', new NotConfiguredPaymentProvider('onepay')],
  ]);

  getProvider(code: string): PaymentProvider {
    const provider = this.providers.get(code);
    if (!provider) {
      throw new BadRequestException(`Unsupported payment provider: ${code}`);
    }
    return provider;
  }

  async listProviders() {
    const active = await this.prisma.paymentProvider.findMany({ where: { isActive: true } });
    return active.filter((item) => this.providers.has(item.code) && !(this.providers.get(item.code) instanceof NotConfiguredPaymentProvider))
      .map((item) => ({ code: item.code, name: item.name }));
  }

  async listProvidersAdmin() {
    const stored = await this.prisma.paymentProvider.findMany();
    const records = new Map(stored.map((item) => [item.code, item]));
    const codes = new Set([...this.providers.keys(), ...records.keys()]);
    return [...codes].map((code) => {
      const adapter = this.providers.get(code);
      const record = records.get(code);
      const configured = Boolean(adapter && !(adapter instanceof NotConfiguredPaymentProvider));
      const config = record?.config && typeof record.config === 'object' && !Array.isArray(record.config)
        ? record.config as Record<string, unknown> : {};
      return {
        code, name: record?.name ?? providerNames[code] ?? code, configured,
        active: Boolean(record?.isActive) && configured, storedAsActive: Boolean(record?.isActive),
        envVariables: Array.isArray(config.envVariables) ? config.envVariables : [],
        minimumRechargeLyd: typeof config.minimumRechargeMilli === 'string' ? toLyd(BigInt(config.minimumRechargeMilli)) : null,
        maximumRechargeLyd: typeof config.maximumRechargeMilli === 'string' ? toLyd(BigInt(config.maximumRechargeMilli)) : null,
        fixedFeeLyd: typeof config.fixedFeeMilli === 'string' ? toLyd(BigInt(config.fixedFeeMilli)) : null,
        percentageFee: typeof config.percentageFee === 'number' ? config.percentageFee : null,
      };
    });
  }

  async saveProviderDefinition(input: { code: string; name: string; envVariables: string[]; minimumRechargeLyd?: string;
    maximumRechargeLyd?: string; fixedFeeLyd?: string; percentageFee?: number; active: boolean }, actorId: string) {
    const adapter = this.providers.get(input.code);
    const configured = Boolean(adapter && !(adapter instanceof NotConfiguredPaymentProvider));
    if (input.active && !configured) throw new BadRequestException('payment.provider_adapter_not_configured');
    const before = await this.prisma.paymentProvider.findUnique({ where: { code: input.code } });
    const config = {
      envVariables: [...new Set(input.envVariables)],
      minimumRechargeMilli: input.minimumRechargeLyd ? toMilli(input.minimumRechargeLyd).toString() : null,
      maximumRechargeMilli: input.maximumRechargeLyd ? toMilli(input.maximumRechargeLyd).toString() : null,
      fixedFeeMilli: input.fixedFeeLyd ? toMilli(input.fixedFeeLyd).toString() : null,
      percentageFee: input.percentageFee ?? null,
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const provider = await tx.paymentProvider.upsert({ where: { code: input.code },
        create: { code: input.code, name: input.name.trim(), isActive: input.active, config },
        update: { name: input.name.trim(), isActive: input.active, config } });
      await tx.auditLog.create({ data: { actorId, action: before ? 'admin.payment_provider.definition_updated' : 'admin.payment_provider.created',
        entityType: 'PaymentProvider', entityId: provider.id,
        before: before ? { name: before.name, isActive: before.isActive } : undefined,
        after: { code: provider.code, name: provider.name, isActive: provider.isActive, envVariables: config.envVariables } } });
      return provider;
    });
    return { code: saved.code, name: saved.name, configured, active: saved.isActive && configured, storedAsActive: saved.isActive, ...config };
  }

  async setProviderActive(code: string, active: boolean, actorId: string) {
    const adapter = this.getProvider(code);
    if (active && adapter instanceof NotConfiguredPaymentProvider) {
      throw new BadRequestException('payment.provider_adapter_not_configured');
    }
    const before = await this.prisma.paymentProvider.findUnique({ where: { code } });
    const provider = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.paymentProvider.upsert({ where: { code },
        create: { code, name: before?.name ?? providerNames[code] ?? code, isActive: active }, update: { isActive: active } });
      await tx.auditLog.create({ data: { actorId, action: 'admin.payment_provider.updated', entityType: 'PaymentProvider', entityId: saved.id,
        before: { isActive: before?.isActive ?? false }, after: { code, isActive: saved.isActive } } });
      return saved;
    });
    return { code: provider.code, name: provider.name, active: provider.isActive, configured: true };
  }

  async ownOrders(userId: string) {
    const orders = await this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { payments: { select: { id: true, status: true, provider: true, createdAt: true } } } });
    return orders.map((order) => ({ id: order.id, type: order.type, status: order.status, subtotalLyd: toLyd(order.subtotal),
      feesLyd: toLyd(order.fees), totalLyd: toLyd(order.total), currency: order.currency, expiresAt: order.expiresAt,
      referenceId: order.referenceId, createdAt: order.createdAt, payments: order.payments }));
  }

  async create(userId: string, orderId: string, providerCode: string, idempotencyKey: string) {
    const provider = this.getProvider(providerCode);
    const configured = await this.prisma.paymentProvider.findUnique({ where: { code: providerCode } });
    if (!configured?.isActive || provider instanceof NotConfiguredPaymentProvider) throw new ServiceUnavailableException('payment.provider_not_configured');
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('order.not_found');
    if (order.status !== 'PaymentPending' || (order.expiresAt && order.expiresAt <= new Date())) throw new ConflictException('order.not_payable');
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || existing.orderId !== orderId || existing.provider !== providerCode) throw new ConflictException('payment.idempotency_conflict');
      return { id: existing.id, status: existing.status, checkoutUrl: existing.checkoutUrl };
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.order.updateMany({ where: { id: orderId, version: order.version, status: 'PaymentPending' }, data: { version: { increment: 1 } } });
      if (!locked.count) throw new ConflictException('payment.concurrent_update');
      if (await tx.payment.findFirst({ where: { orderId, status: { in: ['Pending', 'Processing', 'Paid'] } } })) throw new ConflictException('payment.already_in_progress');
      return tx.payment.create({ data: { userId, orderId, amount: order.total, currency: order.currency, provider: providerCode, idempotencyKey } });
    });
    try {
      const result = await provider.createPayment({ idempotencyKey: payment.id, orderId, userId, amount: payment.amount.toString(), currency: payment.currency, description: order.type });
      // Checkout responses never confirm payment; only a verified provider event may do so.
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'Processing', providerTransactionId: result.providerTransactionId, checkoutUrl: result.redirectUrl } });
      return { id: payment.id, status: 'Processing', checkoutUrl: result.redirectUrl };
    } catch (error) {
      // An ambiguous provider timeout stays pending so retries cannot cause a second charge.
      await this.prisma.auditLog.create({ data: { actorId: userId, action: 'payment.checkout.pending_reconciliation', entityType: 'Payment', entityId: payment.id } });
      throw error;
    }
  }

  async webhook(providerCode: string, input: VerifyWebhookInput) {
    const adapter = this.getProvider(providerCode);
    const event = await adapter.verifyWebhook(input);
    if (!event.providerEventId || !event.providerTransactionId || !/^\d+$/.test(event.amountMilli)) throw new ConflictException('payment.invalid_event');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const eventKey = `${providerCode}:${event.providerEventId}`;
        if (await tx.paymentTransaction.findUnique({ where: { providerEventId: eventKey } })) return { received: true, duplicate: true };
        const payment = await tx.payment.findFirst({ where: { provider: providerCode, providerTransactionId: event.providerTransactionId }, include: { order: true } });
        if (!payment) throw new NotFoundException('payment.not_found');
        if (payment.amount !== BigInt(event.amountMilli) || payment.currency !== event.currency) throw new ConflictException('payment.amount_or_currency_mismatch');
        if (payment.status === 'Paid') return { received: true, duplicate: true };
        if (!['Pending', 'Processing'].includes(payment.status)) throw new ConflictException('payment.invalid_transition');
        if (!['Paid', 'Failed', 'Cancelled', 'Processing'].includes(event.status)) throw new ConflictException('payment.unsupported_event');
        const order = payment.order;
        if (event.status === 'Paid') {
          if (order.status !== 'PaymentPending' || (order.expiresAt && order.expiresAt <= new Date())) {
            // Preserve late receipts for finance reconciliation without awarding an expired purchase.
            await tx.paymentTransaction.create({ data: { paymentId: payment.id, providerEventId: eventKey, providerTransactionId: event.providerTransactionId, status: 'Paid', amount: payment.amount, currency: payment.currency, webhookVerified: true, rawResponse: { disposition: 'late_payment_review' } } });
            await tx.fraudAlert.create({ data: { userId: payment.userId, type: 'LatePaymentRequiresRefundReview', severity: 'high', evidence: { paymentId: payment.id, orderId: order.id } } });
            return { received: true, reviewRequired: true };
          }
          const locked = await tx.order.updateMany({ where: { id: order.id, version: order.version, status: 'PaymentPending' }, data: { status: 'Paid', version: { increment: 1 } } });
          if (!locked.count) throw new ConflictException('payment.concurrent_update');
          if (order.type === 'AuctionDeposit') {
            const auction = await tx.auction.findUniqueOrThrow({ where: { id: order.referenceId! }, include: { result: true } });
            if (auction.status !== 'PaymentPending' || auction.result?.winnerId !== payment.userId || !auction.result.paymentDueAt || auction.result.paymentDueAt <= new Date()) throw new ConflictException('payment.winner_expired');
            const changed = await tx.auction.updateMany({ where: { id: auction.id, version: auction.version, status: 'PaymentPending' }, data: { status: 'Sold', version: { increment: 1 } } });
            if (!changed.count) throw new ConflictException('payment.concurrent_update');
            await tx.auctionResult.update({ where: { auctionId: auction.id }, data: { status: 'Sold' } });
          } else if (order.type === 'InspectionFee') {
            const changed = await tx.inspectionRequest.updateMany({ where: { id: order.referenceId!, requesterId: payment.userId, status: 'PaymentPending' }, data: { status: 'Paid', version: { increment: 1 } } });
            if (!changed.count) throw new ConflictException('payment.inspection_invalid');
          } else if (order.type === 'DealerSubscription') {
            const subscription = await tx.dealerSubscription.findUnique({
              where: { id: order.referenceId! },
              include: { dealer: true, plan: true },
            });
            if (!subscription || subscription.dealer.ownerUserId !== payment.userId || subscription.status !== 'Pending') {
              throw new ConflictException('payment.subscription_invalid');
            }
            const metadata = order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
              ? order.metadata as Record<string, unknown> : {};
            const now = new Date();
            const startsAt = subscription.startsAt ?? now;
            const endsAt = subscription.endsAt ?? new Date(startsAt.getTime() + subscription.plan.durationDays * 86_400_000);
            if (metadata.action !== 'renewal' || startsAt <= now) {
              await tx.dealerSubscription.updateMany({
                where: { dealerId: subscription.dealerId, id: { not: subscription.id }, status: 'Active', startsAt: { lte: now }, endsAt: { gt: now } },
                data: { status: 'Expired', endsAt: now },
              });
            }
            await tx.dealerSubscription.update({ where: { id: subscription.id }, data: {
              status: 'Active', startsAt, endsAt, activatedAt: now,
            } });
          } else if (order.type === 'AuctionListingFee') {
            const vehicle = await tx.vehicle.findUnique({ where: { id: order.referenceId! } });
            if (!vehicle || vehicle.ownerUserId !== payment.userId || vehicle.approvalStatus !== 'Draft' || vehicle.auctionLocked) {
              throw new ConflictException('payment.auction_listing_invalid');
            }
            await tx.vehicle.update({ where: { id: vehicle.id }, data: { approvalStatus: 'PendingReview' } });
          } else if (order.type === 'MemberSubscription') {
            await activateMemberSubscription(tx, order.referenceId!, payment.userId);
          } else if (order.type !== 'WalletRecharge') {
            throw new ConflictException('payment.order_type_not_supported');
          }
          const base = { userId: payment.userId, amount: payment.amount, currency: payment.currency, referenceId: payment.id };
          await this.wallet.post(tx, { ...base, direction: 'Credit', type: order.type === 'WalletRecharge' ? 'WalletRecharge' : 'ExternalPayment', idempotencyKey: `${payment.id}:funding` });
          if (order.type !== 'WalletRecharge') await this.wallet.post(tx, { ...base, direction: 'Debit', type: order.type, idempotencyKey: `${payment.id}:purchase` }, { externallyFunded: true });
          await tx.notification.create({ data: { userId: payment.userId, title: 'تم تأكيد الدفع', body: 'تم تسجيل الدفع والإيصال في حسابك.', data: { type: 'payment_confirmed', paymentId: payment.id, orderId: order.id } } });
        }
        await tx.payment.update({ where: { id: payment.id }, data: { status: event.status } });
        await tx.paymentTransaction.create({ data: { paymentId: payment.id, providerEventId: eventKey, providerTransactionId: event.providerTransactionId,
          status: event.status, amount: payment.amount, currency: payment.currency, webhookVerified: true } });
        await tx.auditLog.create({ data: { actorId: payment.userId, action: 'payment.provider_event', entityType: 'Payment', entityId: payment.id,
          after: { provider: providerCode, status: event.status, eventId: eventKey, amountMilli: payment.amount.toString() } } });
        return { received: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.paymentTransaction.findUnique({ where: { providerEventId: `${providerCode}:${event.providerEventId}` } });
        if (duplicate) return { received: true, duplicate: true };
      }
      throw error;
    }
  }

  async topup(userId: string, amountLyd: string, idempotencyKey: string) {
    const amount = toMilli(amountLyd);
    if (amount <= 0n || amount > 100_000_000n) throw new BadRequestException('wallet.invalid_amount');
    const existing = await this.prisma.order.findUnique({ where: { id: idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId || existing.type !== 'WalletRecharge' || existing.total !== amount) throw new ConflictException('payment.idempotency_conflict');
      return { id: existing.id, status: existing.status, totalLyd: toLyd(existing.total) };
    }
    const order = await this.prisma.order.create({ data: { id: idempotencyKey, userId, type: 'WalletRecharge', status: 'PaymentPending', subtotal: amount, total: amount, currency: 'LYD', expiresAt: new Date(Date.now() + 86400000) } });
    return { id: order.id, status: order.status, totalLyd: toLyd(order.total) };
  }

  async payFromWallet(userId: string, orderId: string, idempotencyKey: string) {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.payment.findUnique({ where: { idempotencyKey } });
      if (prior) {
        if (prior.userId !== userId || prior.orderId !== orderId || prior.provider !== 'wallet') throw new ConflictException('payment.idempotency_conflict');
        return { id: prior.id, status: prior.status, duplicate: true };
      }
      const order = await tx.order.findFirst({ where: { id: orderId, userId } });
      if (!order) throw new NotFoundException('order.not_found');
      if (order.status !== 'PaymentPending' || (order.expiresAt && order.expiresAt <= new Date())) throw new ConflictException('order.not_payable');
      if (!['MemberSubscription', 'DealerSubscription', 'AuctionListingFee', 'InspectionFee', 'AuctionDeposit'].includes(order.type)) throw new BadRequestException('payment.wallet_order_not_supported');
      const claim = await tx.order.updateMany({ where: { id: order.id, version: order.version, status: 'PaymentPending' }, data: { status: 'Paid', version: { increment: 1 } } });
      if (!claim.count) throw new ConflictException('payment.concurrent_update');
      if (await tx.payment.findFirst({ where: { orderId, status: { in: ['Pending', 'Processing', 'Paid'] } } })) throw new ConflictException('payment.already_in_progress');
      const payment = await tx.payment.create({ data: { userId, orderId, amount: order.total, currency: order.currency, provider: 'wallet', status: 'Paid', idempotencyKey } });
      await this.wallet.post(tx, { userId, amount: order.total, currency: order.currency, referenceId: payment.id, direction: 'Debit', type: order.type, idempotencyKey: `${payment.id}:purchase` }, { settlingAuctionId: order.type === 'AuctionDeposit' ? order.referenceId! : undefined });
      if (order.type === 'MemberSubscription') await activateMemberSubscription(tx, order.referenceId!, userId);
      if (order.type === 'DealerSubscription') {
        const s = await tx.dealerSubscription.findUnique({ where: { id: order.referenceId! }, include: { dealer: true, plan: true } });
        if (!s || s.status !== 'Pending' || s.dealer.ownerUserId !== userId) throw new ConflictException('payment.subscription_invalid');
        const now = new Date(), startsAt = s.startsAt ?? now, endsAt = s.endsAt ?? new Date(startsAt.getTime() + s.plan.durationDays * 86400000);
        if (endsAt <= now) throw new ConflictException('payment.subscription_invalid');
        if (startsAt <= now) await tx.dealerSubscription.updateMany({ where: { dealerId: s.dealerId, id: { not: s.id }, status: 'Active', startsAt: { lte: now }, endsAt: { gt: now } }, data: { status: 'Expired', endsAt: now } });
        await tx.dealerSubscription.update({ where: { id: s.id }, data: { status: 'Active', startsAt, endsAt, activatedAt: now } });
      }
      if (order.type === 'InspectionFee') {
        const changed = await tx.inspectionRequest.updateMany({ where: { id: order.referenceId!, requesterId: userId, status: 'PaymentPending' }, data: { status: 'Paid', version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('payment.inspection_invalid');
      }
      if (order.type === 'AuctionListingFee') {
        const changed = await tx.vehicle.updateMany({ where: { id: order.referenceId!, ownerUserId: userId, approvalStatus: 'Draft', auctionLocked: false }, data: { approvalStatus: 'PendingReview' } });
        if (!changed.count) throw new ConflictException('payment.auction_listing_invalid');
      }
      if (order.type === 'AuctionDeposit') {
        const auction = await tx.auction.findUnique({ where: { id: order.referenceId! }, include: { result: true } });
        if (!auction || auction.status !== 'PaymentPending' || auction.result?.winnerId !== userId || !auction.result.paymentDueAt || auction.result.paymentDueAt <= new Date()) throw new ConflictException('payment.winner_expired');
        const changed = await tx.auction.updateMany({ where: { id: auction.id, version: auction.version, status: 'PaymentPending' }, data: { status: 'Sold', version: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('payment.concurrent_update');
        await tx.auctionResult.update({ where: { auctionId: auction.id }, data: { status: 'Sold' } });
      }
      await tx.paymentTransaction.create({ data: { paymentId: payment.id, providerEventId: `wallet:${payment.id}`, providerTransactionId: payment.id, status: 'Paid', amount: payment.amount, currency: payment.currency, webhookVerified: false } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'payment.wallet.paid', entityType: 'Payment', entityId: payment.id, after: { orderId, amountMilli: payment.amount.toString() } } });
      await tx.notification.create({ data: { userId, title: 'تم الدفع من المحفظة', body: 'تم تسجيل الدفع في سجل المحفظة.', data: { type: 'payment_confirmed', orderId, route: '/account' } } });
      return { id: payment.id, status: 'Paid', duplicate: false };
    });
  }
}
