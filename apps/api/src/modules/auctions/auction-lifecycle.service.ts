import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { percentage } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';
import { notDeleted } from '../../common/mongo-filters';

type Rules = { depositBasisPoints: number; buyerFeeMilli: number; paymentDeadlineMinutes: number; fallbackWinners: number; autoRelist: boolean };

@Injectable()
export class AuctionLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionLifecycleService.name);
  private timer?: ReturnType<typeof setInterval>;
  private queue?: Queue;
  private worker?: Worker;
  private redis?: Redis;
  private busy = false;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly realtime: AuctionRealtimeGateway) {}

  async onModuleInit() {
    const mode = this.config.get<string>('AUCTION_WORKER_MODE') ?? (this.config.get('NODE_ENV') === 'production' ? 'redis' : 'poll');
    if (mode === 'off') return;
    if (mode === 'redis') {
      this.redis = new Redis(this.config.getOrThrow('REDIS_URL'), { maxRetriesPerRequest: null });
      this.queue = new Queue('auction-lifecycle', { connection: this.redis });
      this.worker = new Worker('auction-lifecycle', async () => this.reconcile(), { connection: this.redis, concurrency: 1 });
      this.worker.on('error', (error) => this.logger.error(error.message));
      await this.queue.upsertJobScheduler('reconcile', { every: 2000 }, { name: 'reconcile', data: {}, opts: { removeOnComplete: true, removeOnFail: 100 } });
    } else {
      this.timer = setInterval(() => { void this.reconcile().catch((error: Error) => this.logger.error(error.message)); }, 2000);
      this.timer.unref();
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
    await this.redis?.quit();
  }

  async reconcile() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      const starting = await this.prisma.auction.findMany({ where: { status: 'Scheduled', startsAt: { lte: now }, endsAt: { gt: now } }, select: { id: true, version: true }, take: 100 });
      for (const auction of starting) {
        const changed = await this.prisma.auction.updateMany({ where: { id: auction.id, status: 'Scheduled', version: auction.version,
          startsAt: { lte: now }, endsAt: { gt: now } }, data: { status: 'Live', version: { increment: 1 } } });
        if (changed.count) this.realtime.broadcastStatus(auction.id, { auctionId: auction.id, status: 'Live' });
      }
      const due = await this.prisma.auction.findMany({ where: { status: { in: ['Live', 'Scheduled'] }, endsAt: { lte: now } }, select: { id: true }, take: 100 });
      for (const item of due) await this.settleSafely(item.id);
      const expired = await this.prisma.auctionResult.findMany({ where: { status: 'PaymentPending', paymentDueAt: { lte: now } }, select: { auctionId: true }, take: 100 });
      for (const item of expired) await this.settleSafely(item.auctionId);
    } finally { this.busy = false; }
  }

  private async settleSafely(auctionId: string) {
    try { await this.settle(auctionId); }
    catch (error) { this.logger.error(`Settlement failed for ${auctionId}: ${(error as Error).message}`); }
  }

  async settle(auctionId: string) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId }, include: {
          result: true, vehicle: { select: { ownerUserId: true, dealer: { select: { ownerUserId: true } } } },
        } });
        if (!auction) return;
        const now = new Date();
        const expired = auction.status === 'PaymentPending' && auction.result?.paymentDueAt && auction.result.paymentDueAt <= now;
        if (!expired && (!['Live', 'Scheduled'].includes(auction.status) || auction.endsAt > now)) return;
        // The auction version is the shared write lock for bidding, settlement and deposit payment.
        const claimed = await tx.auction.updateMany({ where: { id: auctionId, version: auction.version, status: auction.status }, data: { version: { increment: 1 } } });
        if (!claimed.count) return;
        const rules = auction.ruleSnapshot as Rules | null;
        if (!rules) throw new Error('auction.rules_snapshot_missing');
        const excluded = [...(auction.result?.excludedWinnerIds ?? [])];
        const attempt = expired ? (auction.result?.winnerAttempt ?? 0) + 1 : 0;
        if (expired && auction.result?.winnerId) {
          excluded.push(auction.result.winnerId);
          await tx.order.updateMany({ where: { referenceId: auctionId, type: 'AuctionDeposit', status: 'PaymentPending' }, data: { status: 'Expired', version: { increment: 1 } } });
          await tx.notification.create({ data: { userId: auction.result.winnerId, title: 'انتهت مهلة العربون', body: 'انتهت مهلة تأكيد الفوز بهذا المزاد.', data: { type: 'payment_expired', auctionId } } });
        }
        const bids = attempt <= rules.fallbackWinners ? await tx.bid.findMany({
          where: { auctionId, status: { in: ['Accepted', 'Outbid'] }, bidderId: { notIn: excluded },
            bidder: { status: 'Active', ...notDeleted, phoneVerifiedAt: { not: null } } },
          orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }], take: 1,
        }) : [];
        const winner = bids[0];
        const reserveMet = Boolean(winner && (auction.reservePrice === null || winner.amount >= auction.reservePrice));
        const status = reserveMet ? 'PaymentPending' as const : 'NoWinner' as const;
        const finalAmount = reserveMet ? winner.amount : null;
        const deposit = finalAmount === null ? 0n : percentage(finalAmount, rules.depositBasisPoints);
        const fee = finalAmount === null ? 0n : BigInt(rules.buyerFeeMilli);
        const paymentDueAt = reserveMet ? new Date(now.getTime() + rules.paymentDeadlineMinutes * 60_000) : null;
        const resultData = { winnerId: reserveMet ? winner.bidderId : null, finalAmount, reserveMet,
          buyerFee: fee, depositAmount: deposit, remainingAmount: (finalAmount ?? 0n) - deposit,
          paymentDueAt, status, winnerAttempt: attempt, excludedWinnerIds: excluded };
        await tx.auctionResult.upsert({ where: { auctionId }, create: { auctionId, ...resultData }, update: resultData });
        await tx.auction.update({ where: { id: auctionId }, data: { status } });
        if (reserveMet) {
          await tx.order.create({ data: { userId: winner.bidderId, type: 'AuctionDeposit', status: 'PaymentPending',
            subtotal: deposit, fees: fee, total: deposit + fee, currency: 'LYD', referenceId: auctionId,
            expiresAt: paymentDueAt, metadata: { winnerAttempt: attempt, finalAmountMilli: winner.amount.toString() } } });
          await tx.notification.create({ data: { userId: winner.bidderId, title: 'لقد فزت بالمزاد', body: 'راجع تفاصيل العربون والمهلة في مشترياتك.', data: { type: 'auction_won', auctionId, route: '/account' } } });
        } else {
          await tx.vehicle.update({ where: { id: auction.vehicleId }, data: { auctionLocked: false, auctionVersion: { increment: 1 } } });
          if (!rules.autoRelist) {
            const sellers = new Set([auction.vehicle.ownerUserId, auction.vehicle.dealer?.ownerUserId]);
            for (const userId of sellers) {
              if (userId) await tx.notification.create({ data: { userId, title: 'انتهى المزاد بدون فائز',
                body: 'يمكنك مراجعة نتيجة المزاد وطلب إلغائه من صفحة المزاد.',
                data: { type: 'auction_no_winner', auctionId, route: `/auctions/${auctionId}` } } });
            }
          }
          if (rules.autoRelist) {
            const duration = Math.max(60_000, auction.endsAt.getTime() - auction.startsAt.getTime());
            await tx.auction.create({ data: { vehicleId: auction.vehicleId, startsAt: new Date(now.getTime() + duration), endsAt: new Date(now.getTime() + duration * 2),
              startingPrice: auction.startingPrice, bidIncrement: auction.bidIncrement, reservePrice: auction.reservePrice,
              maxBidAmount: auction.maxBidAmount, antiSnipingWindowSeconds: auction.antiSnipingWindowSeconds, antiSnipingExtensionSeconds: auction.antiSnipingExtensionSeconds,
              ruleSnapshot: rules, status: 'Scheduled' } });
            await tx.vehicle.update({ where: { id: auction.vehicleId }, data: { auctionLocked: true } });
            await tx.auction.update({ where: { id: auctionId }, data: { status: 'Relisted' } });
          }
        }
        await tx.auditLog.create({ data: { action: expired ? 'auction.winner.expired' : 'auction.settled', entityType: 'Auction', entityId: auctionId,
          before: { winnerId: auction.result?.winnerId ?? null, status: auction.status }, after: { winnerId: resultData.winnerId, status, attempt, finalAmountMilli: finalAmount?.toString() ?? null } } });
        return { status, paymentDueAt };
      });
      if (result) this.realtime.broadcastStatus(auctionId, { auctionId, ...result });
      return result;
    } catch (error) {
      if (['P2034', 'P2002'].includes((error as { code: string }).code)) return;
      throw error;
    }
  }
}
