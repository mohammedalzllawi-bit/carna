import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function activateMemberSubscription(tx: Prisma.TransactionClient, id: string, userId: string) {
  const subscription = await tx.memberSubscription.findUnique({ where: { id } });
  if (!subscription || subscription.userId !== userId || subscription.status !== 'Pending') {
    throw new ConflictException('subscription.invalid_payment_target');
  }
  const snapshot = subscription.snapshot as { durationDays?: number };
  if (!Number.isInteger(snapshot.durationDays) || snapshot.durationDays! < 1) throw new ConflictException('subscription.invalid_snapshot');
  const now = new Date();
  const latest = await tx.memberSubscription.findFirst({ where: { userId, status: 'Active', endsAt: { gt: now } }, orderBy: { endsAt: 'desc' } });
  const startsAt = latest?.planId === subscription.planId && latest.endsAt ? latest.endsAt : now;
  if (startsAt <= now) await tx.memberSubscription.updateMany({ where: { userId, status: 'Active' }, data: { status: 'Expired', endsAt: now, version: { increment: 1 } } });
  const changed = await tx.memberSubscription.updateMany({ where: { id, status: 'Pending', version: subscription.version },
    data: { status: 'Active', startsAt, endsAt: new Date(startsAt.getTime() + snapshot.durationDays! * 86400000), version: { increment: 1 } } });
  if (!changed.count) throw new ConflictException('subscription.concurrent_update');
}
