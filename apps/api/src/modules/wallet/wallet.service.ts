import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toLyd, toMilli } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminWalletAdjustmentDto } from './dto/admin-wallet.dto';

type Entry = { userId: string; direction: 'Credit' | 'Debit'; amount: bigint; currency: string; type: string;
  referenceId: string; idempotencyKey: string; description?: string; metadata?: Prisma.InputJsonValue };

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async own(userId: string) {
    const [accounts, entries] = await Promise.all([
      this.prisma.walletAccount.findMany({ where: { userId } }),
      this.prisma.walletLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const withdrawals = await this.prisma.walletWithdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { accounts: accounts.map((account) => ({ currency: account.currency, balanceLyd: toLyd(account.balance) })),
      withdrawals: withdrawals.map(({ amount, ...w }) => ({ ...w, amountLyd: toLyd(amount) })),
      entries: entries.map((entry) => ({ id: entry.id, amountLyd: toLyd(entry.amount), direction: entry.direction, currency: entry.currency, type: entry.type, referenceId: entry.referenceId, createdAt: entry.createdAt })) };
  }

  async adminSummary(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, phone: true } });
    if (!user) throw new NotFoundException('user.not_found');
    const base = { userId, currency: 'LYD' };
    const [accounts, entries, credits, debits, rechargeCount, recharges, adjustmentCredits, adjustmentDebits] = await Promise.all([
      this.prisma.walletAccount.findMany({ where: { userId }, orderBy: { currency: 'asc' } }),
      this.prisma.walletLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.walletLedger.aggregate({ where: { ...base, direction: 'Credit' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.walletLedger.aggregate({ where: { ...base, direction: 'Debit' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.walletLedger.count({ where: { ...base, direction: 'Credit', type: 'WalletRecharge' } }),
      this.prisma.walletLedger.aggregate({ where: { ...base, direction: 'Credit', type: 'WalletRecharge' }, _sum: { amount: true } }),
      this.prisma.walletLedger.aggregate({ where: { ...base, direction: 'Credit', type: 'AdminAdjustment' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.walletLedger.aggregate({ where: { ...base, direction: 'Debit', type: 'AdminAdjustment' }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return {
      user,
      accounts: accounts.map((account) => ({ currency: account.currency, balanceLyd: toLyd(account.balance), updatedAt: account.updatedAt })),
      summary: {
        balanceLyd: toLyd(accounts.find((account) => account.currency === 'LYD')?.balance ?? 0n),
        totalCreditsLyd: toLyd(credits._sum.amount ?? 0n), creditCount: credits._count._all,
        totalSpentLyd: toLyd(debits._sum.amount ?? 0n), debitCount: debits._count._all,
        rechargeTotalLyd: toLyd(recharges._sum.amount ?? 0n), rechargeCount,
        adminCreditLyd: toLyd(adjustmentCredits._sum.amount ?? 0n), adminCreditCount: adjustmentCredits._count._all,
        adminDebitLyd: toLyd(adjustmentDebits._sum.amount ?? 0n), adminDebitCount: adjustmentDebits._count._all,
      },
      entries: entries.map((entry) => ({
        id: entry.id, amountLyd: toLyd(entry.amount), direction: entry.direction, currency: entry.currency,
        type: entry.type, referenceId: entry.referenceId, description: entry.description, createdAt: entry.createdAt,
      })),
    };
  }

  async adminAdjust(userId: string, actorId: string, input: AdminWalletAdjustmentDto) {
    const amount = toMilli(input.amountLyd);
    const reason = input.reason.trim();
    const referenceId = `admin-adjustment:${input.idempotencyKey}`;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException('user.not_found');
      const existing = await tx.walletLedger.findUnique({ where: { idempotencyKey: referenceId } });
      if (existing) {
        if (existing.userId !== userId || existing.amount !== amount || existing.direction !== input.direction || existing.currency !== 'LYD') {
          throw new ConflictException('wallet.idempotency_conflict');
        }
        return { duplicate: true };
      }
      const before = await tx.walletAccount.findUnique({ where: { userId_currency: { userId, currency: 'LYD' } } });
      const entry = await this.post(tx, {
        userId, direction: input.direction, amount, currency: 'LYD', type: 'AdminAdjustment', referenceId,
        idempotencyKey: referenceId, description: reason, metadata: { actorId },
      });
      const after = await tx.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId, currency: 'LYD' } } });
      await tx.auditLog.create({ data: {
        actorId, action: input.direction === 'Credit' ? 'admin.wallet.credited' : 'admin.wallet.debited',
        entityType: 'WalletAccount', entityId: after.id,
        before: { userId, balanceMilli: (before?.balance ?? 0n).toString() },
        after: { userId, balanceMilli: after.balance.toString(), amountMilli: amount.toString(), reason, ledgerId: entry.id },
      } });
      await tx.notification.create({ data: {
        userId,
        title: input.direction === 'Credit' ? 'إضافة رصيد إلى المحفظة' : 'خصم من المحفظة',
        body: `${input.direction === 'Credit' ? 'تمت إضافة' : 'تم خصم'} ${toLyd(amount).toLocaleString('ar-LY')} د.ل. السبب: ${reason}`,
        data: { type: 'wallet_admin_adjustment', direction: input.direction, amountMilli: amount.toString(), ledgerId: entry.id },
      } });
      return { duplicate: false };
    });
    return { ...(await this.adminSummary(userId)), duplicate: outcome.duplicate };
  }

  // Internal only: callers must share their financial transaction with this operation.
  async assertWithdrawable(tx: Prisma.TransactionClient, userId: string, settlingAuctionId?: string) {
    const committed = await tx.bid.findFirst({ where: { bidderId: userId, status: { in: ['Accepted', 'Outbid'] },
      ...(settlingAuctionId ? { auctionId: { not: settlingAuctionId } } : {}),
      auction: { status: { in: ['Live', 'Paused', 'PaymentPending'] } } }, select: { id: true } });
    if (committed) throw new ConflictException('wallet.auction_commitment_active');
  }

  async requestWithdrawal(userId: string, input: { amountLyd: string; reason: string; idempotencyKey: string }) {
    const amount = toMilli(input.amountLyd);
    if (amount <= 0n) throw new BadRequestException('wallet.invalid_amount');
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.walletWithdrawal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        if (prior.userId !== userId || prior.amount !== amount) throw new ConflictException('wallet.idempotency_conflict');
        return { id: prior.id, status: prior.status, duplicate: true };
      }
      await this.assertWithdrawable(tx, userId);
      const request = await tx.walletWithdrawal.create({ data: { userId, amount, reason: input.reason.trim(), idempotencyKey: input.idempotencyKey } });
      await this.post(tx, { userId, amount, direction: 'Debit', currency: 'LYD', type: 'WithdrawalReservation', referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:reserve` });
      await tx.auditLog.create({ data: { actorId: userId, action: 'wallet.withdrawal.requested', entityType: 'WalletWithdrawal', entityId: request.id, after: { amountMilli: amount.toString() } } });
      return { id: request.id, status: request.status, duplicate: false };
    });
  }

  async withdrawalsAdmin() {
    const items = await this.prisma.walletWithdrawal.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return items.map(({ amount, ...w }) => ({ ...w, amountLyd: toLyd(amount) }));
  }

  async resolveWithdrawal(id: string, actorId: string, input: { action: 'paid' | 'reject'; reason: string; transferReference?: string }) {
    if (input.action === 'paid' && !input.transferReference?.trim()) throw new BadRequestException('wallet.transfer_reference_required');
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.walletWithdrawal.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('wallet.withdrawal_not_found');
      if (request.status !== 'Pending') throw new ConflictException('wallet.withdrawal_already_resolved');
      const status = input.action === 'paid' ? 'Paid' : 'Rejected';
      const claimed = await tx.walletWithdrawal.updateMany({ where: { id, version: request.version, status: 'Pending' }, data: { status, version: { increment: 1 }, adminReason: input.reason.trim(), transferReference: input.transferReference?.trim() ?? null } });
      if (!claimed.count) throw new ConflictException('wallet.concurrent_update');
      if (status === 'Rejected') await this.post(tx, { userId: request.userId, amount: request.amount, direction: 'Credit', currency: 'LYD', type: 'WithdrawalReleased', referenceId: id, idempotencyKey: `withdrawal:${id}:release` });
      await tx.auditLog.create({ data: { actorId, action: `admin.wallet.withdrawal.${status}`, entityType: 'WalletWithdrawal', entityId: id, before: { status: request.status }, after: { status, reason: input.reason, transferReference: input.transferReference ?? null } } });
      await tx.notification.create({ data: { userId: request.userId, title: status === 'Paid' ? 'تم تحويل الرصيد المطلوب' : 'تمت إعادة الرصيد إلى المحفظة', body: input.reason, data: { type: 'wallet_withdrawal', route: '/account' } } });
      return { id, status };
    });
  }

  async post(tx: Prisma.TransactionClient, entry: Entry, options: { externallyFunded?: boolean; settlingAuctionId?: string } = {}) {
    if (entry.amount < 0n) throw new BadRequestException('wallet.invalid_amount');
    const existing = await tx.walletLedger.findUnique({ where: { idempotencyKey: entry.idempotencyKey } });
    if (existing) {
      if (existing.userId !== entry.userId || existing.amount !== entry.amount || existing.direction !== entry.direction || existing.currency !== entry.currency || existing.referenceId !== entry.referenceId) throw new ConflictException('wallet.idempotency_conflict');
      return existing;
    }
    if (entry.direction === 'Debit' && !options.externallyFunded) await this.assertWithdrawable(tx, entry.userId, options.settlingAuctionId);
    const identity = { userId: entry.userId, currency: entry.currency };
    let account = await tx.walletAccount.findUnique({ where: { userId_currency: identity } });
    if (!account) {
      if (await tx.walletLedger.count({ where: identity })) throw new ConflictException('wallet.legacy_reconciliation_required');
      account = await tx.walletAccount.create({ data: identity });
    }
    const changed = await tx.walletAccount.updateMany({
      where: { id: account.id, version: account.version, ...(entry.direction === 'Debit' ? { balance: { gte: entry.amount } } : {}) },
      data: { balance: entry.direction === 'Credit' ? { increment: entry.amount } : { decrement: entry.amount }, version: { increment: 1 } },
    });
    if (!changed.count) throw new ConflictException('wallet.insufficient_balance_or_concurrent_update');
    return tx.walletLedger.create({ data: entry });
  }
}
