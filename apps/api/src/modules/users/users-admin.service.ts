import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { notRevoked } from '../../common/mongo-filters';
import { toLyd } from '../../common/money';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';

const userInclude = {
  roles: { include: { role: true } },
  _count: { select: { bids: true, payments: true, inspectionRequests: true, disputes: true } },
};
type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class UsersAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({ include: userInclude, orderBy: { createdAt: 'desc' }, take: 200 });
    return users.map((user) => this.serialize(user));
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id }, include: {
        ...userInclude,
        ownedDealer: { select: { id: true, name: true, status: true } },
        technician: { select: { id: true, name: true, specialty: true, approvalStatus: true } },
        documents: { select: { id: true, type: true, fileName: true, status: true, createdAt: true } },
      },
    });
    if (!user) throw new NotFoundException('user.not_found');
    const [orders, payments, bids, wins, inspections, disputes, vehicles] = await Promise.all([
      this.prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        include: { payments: { select: { id: true, status: true, provider: true, createdAt: true } } } }),
      this.prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, orderId: true, amount: true, currency: true, provider: true, status: true, createdAt: true } }),
      this.prisma.bid.findMany({ where: { bidderId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        include: { auction: { select: { status: true, vehicle: { select: { id: true, make: true, model: true, year: true, lotNumber: true } } } } } }),
      this.prisma.auctionResult.findMany({ where: { winnerId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        include: { auction: { select: { id: true, vehicle: { select: { id: true, make: true, model: true, year: true, lotNumber: true } } } } } }),
      this.prisma.inspectionRequest.findMany({ where: { requesterId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        include: { technician: { select: { id: true, name: true } }, vehicle: { select: { id: true, make: true, model: true, year: true, lotNumber: true } } } }),
      this.prisma.dispute.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, caseNumber: true, reason: true, status: true, amount: true, createdAt: true } }),
      this.prisma.vehicle.findMany({ where: { ownerUserId: id }, orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, lotNumber: true, make: true, model: true, year: true, saleType: true, approvalStatus: true, createdAt: true } }),
    ]);
    return {
      ...this.serialize(user),
      email: user.email,
      avatarUrl: user.avatarUrl,
      locale: user.defaultLocale,
      relatedProfile: { dealer: user.ownedDealer, technician: user.technician },
      documents: user.documents,
      orders: orders.map((order) => ({ id: order.id, type: order.type, status: order.status, totalLyd: toLyd(order.total),
        currency: order.currency, referenceId: order.referenceId, expiresAt: order.expiresAt, createdAt: order.createdAt, payments: order.payments })),
      payments: payments.map((payment) => ({ ...payment, amount: undefined, amountLyd: toLyd(payment.amount) })),
      bids: bids.map((bid) => ({ id: bid.id, auctionId: bid.auctionId, amountLyd: toLyd(bid.amount), status: bid.status,
        createdAt: bid.createdAt, auctionStatus: bid.auction.status, vehicle: bid.auction.vehicle })),
      wins: wins.map((win) => ({ id: win.id, auctionId: win.auctionId, finalAmountLyd: win.finalAmount === null ? null : toLyd(win.finalAmount),
        depositAmountLyd: toLyd(win.depositAmount), remainingAmountLyd: toLyd(win.remainingAmount), status: win.status,
        createdAt: win.createdAt, vehicle: win.auction.vehicle })),
      inspections: inspections.map((inspection) => ({ id: inspection.id, status: inspection.status, inspectionType: inspection.inspectionType,
        priceLyd: toLyd(inspection.price), scheduledAt: inspection.scheduledAt, createdAt: inspection.createdAt,
        technician: inspection.technician, vehicle: inspection.vehicle })),
      disputes: disputes.map((dispute) => ({ ...dispute, amount: undefined, amountLyd: dispute.amount === null ? null : toLyd(dispute.amount) })),
      vehicles,
    };
  }

  async create(input: CreateAdminUserDto) {
    const phone = this.normalizePhone(input.phone);
    if (await this.prisma.user.findUnique({ where: { phone } })) throw new ConflictException('user.phone_already_registered');
    const roleCodes = input.roles?.length ? input.roles : ['CUSTOMER'];
    const roles = await this.prisma.role.findMany({ where: { code: { in: roleCodes } } });
    if (roles.length !== new Set(roleCodes).size) throw new BadRequestException('user.role_invalid');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        phone,
        fullName: input.fullName.trim(),
        passwordHash,
        status: AccountStatus.PendingVerification,
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      },
      include: userInclude,
    });
    await this.audit('admin.user.created', user.id, null, this.serialize(user));
    return this.serialize(user);
  }

  async update(id: string, input: UpdateAdminUserDto) {
    const before = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!before) throw new NotFoundException('user.not_found');
    if (before.roles.some((entry) => entry.role.code === 'SUPER_ADMIN') &&
        (input.status === 'Archived' || input.status === 'Banned' || input.status === 'Suspended' || (input.roles && !input.roles.includes('SUPER_ADMIN')))) {
      throw new BadRequestException('user.super_admin_protected');
    }

    let roles: { id: string; code: string }[] | undefined;
    if (input.roles) {
      roles = await this.prisma.role.findMany({ where: { code: { in: input.roles } }, select: { id: true, code: true } });
      if (roles.length !== new Set(input.roles).size) throw new BadRequestException('user.role_invalid');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.status || input.roles || input.phoneVerified === false) {
        await tx.refreshSession.updateMany({ where: { userId: id, ...notRevoked }, data: { revokedAt: new Date() } });
      }
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        for (const role of roles) await tx.userRole.create({ data: { userId: id, roleId: role.id } });
      }
      return tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName?.trim(),
          status: input.status,
          phoneVerifiedAt: input.phoneVerified === undefined ? undefined : input.phoneVerified ? new Date() : null,
          deletedAt: input.status === AccountStatus.Archived ? new Date() : input.status ? null : undefined,
        },
        include: userInclude,
      });
    });
    await this.audit('admin.user.updated', id, this.serialize(before), this.serialize(updated));
    return this.serialize(updated);
  }

  archive(id: string) {
    return this.update(id, { status: AccountStatus.Archived });
  }

  private serialize(user: UserWithRelations) {
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      status: user.status,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      roles: user.roles.map((item) => item.role.code),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      activity: user._count,
    };
  }

  private normalizePhone(value: string) {
    const compact = value.replace(/[\s()-]/g, '');
    return compact.startsWith('0') ? `+218${compact.slice(1)}` : compact;
  }

  private audit(action: string, entityId: string, before: object | null, after: object) {
    return this.prisma.auditLog.create({
      data: { action, entityType: 'User', entityId, before: before ?? undefined, after },
    });
  }
}
