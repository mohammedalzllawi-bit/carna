import { Prisma } from '@prisma/client';
import { notDeleted } from '../../common/mongo-filters';

export const notificationAudiences = ['individual', 'dealers', 'users', 'technicians', 'all'] as const;
export type NotificationAudience = typeof notificationAudiences[number];

const eligible: Prisma.UserWhereInput = {
  AND: [notDeleted, { status: { in: ['Active', 'PendingVerification', 'ReviewRequired'] } }],
};

export function audienceWhere(audience: NotificationAudience, recipientId?: string): Prisma.UserWhereInput {
  if (audience === 'individual') return { ...eligible, id: recipientId ?? '' };
  if (audience === 'dealers') return { ...eligible, OR: [
    { ownedDealer: { is: { ...notDeleted, status: { notIn: ['Rejected', 'Archived'] } } } },
    { dealerStaffMemberships: { some: { status: 'Approved', dealer: { ...notDeleted,
      status: { notIn: ['Rejected', 'Archived'] } } } } },
  ] };
  if (audience === 'technicians') return { ...eligible,
    technician: { is: { approvalStatus: { notIn: ['Rejected', 'Archived'] } } } };
  if (audience === 'users') return { ...eligible,
    ownedDealer: { is: null }, dealerStaffMemberships: { none: {} }, technician: { is: null },
    roles: { some: { role: { code: 'CUSTOMER' } } },
    NOT: { roles: { some: { role: { code: { in: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'] } } } } } };
  return eligible;
}
