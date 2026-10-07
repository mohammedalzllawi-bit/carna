import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeleted } from '../../common/mongo-filters';
import {
  CreateTechnicianDto,
  CreateTechnicianReviewDto,
  ModerateTechnicianReviewDto,
  TechnicianQueryDto,
  TechnicianServiceDto,
  UpdateTechnicianDto,
} from './dto/technician.dto';

const technicianInclude = {
  city: true,
  user: { select: { id: true, phone: true, fullName: true, status: true, phoneVerifiedAt: true, lastLoginAt: true, createdAt: true } },
  services: { where: { isActive: true }, orderBy: { name: 'asc' as const } },
};

type TechnicianWithRelations = Prisma.TechnicianGetPayload<{ include: typeof technicianInclude }>;

@Injectable()
export class TechniciansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: TechnicianQueryDto) {
    const technicians = await this.prisma.technician.findMany({
      where: {
        approvalStatus: ApprovalStatus.Published,
        user: { ...notDeleted, status: { notIn: ['Banned', 'Suspended', 'Archived'] } },
        cityId: query.cityId,
        specialty: query.specialty ? { contains: query.specialty.trim() } : undefined,
      },
      include: technicianInclude,
      orderBy: [{ ratingAverage: 'desc' }, { completedInspections: 'desc' }],
    });
    return technicians.map((technician) => this.serialize(technician, false));
  }

  async listAdmin() {
    const technicians = await this.prisma.technician.findMany({
      include: technicianInclude,
      orderBy: { createdAt: 'desc' },
    });
    return technicians.map((technician) => this.serialize(technician, true));
  }

  async publicDetail(id: string) {
    const technician = await this.prisma.technician.findFirst({
      where: { id, approvalStatus: ApprovalStatus.Published, user: { ...notDeleted, status: { notIn: ['Banned', 'Suspended', 'Archived'] } } },
      include: { ...technicianInclude, reviews: { where: { isHidden: false }, include: { reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 } },
    });
    if (!technician) throw new NotFoundException('technician.not_found');
    return {
      ...this.serialize(technician, false),
      reviews: technician.reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment,
        reviewerName: review.reviewer.fullName ?? 'مستخدم', createdAt: review.createdAt })),
    };
  }

  async adminDetail(id: string) {
    const technician = await this.prisma.technician.findUnique({ where: { id }, include: technicianInclude });
    if (!technician) throw new NotFoundException('technician.not_found');
    const [inspections, reviews] = await Promise.all([
      this.prisma.inspectionRequest.findMany({ where: { technicianId: id }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { requester: { select: { id: true, fullName: true, phone: true } }, vehicle: { select: { id: true, lotNumber: true, make: true, model: true, year: true } } } }),
      this.prisma.review.findMany({ where: { technicianId: id }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { reviewer: { select: { id: true, fullName: true, phone: true } } } }),
    ]);
    const completed = inspections.filter((item) => item.status === 'Completed');
    return {
      technician: this.serialize(technician, true),
      stats: {
        requests: inspections.length,
        completed: completed.length,
        cancelled: inspections.filter((item) => ['Cancelled', 'RejectedByTechnician'].includes(item.status)).length,
        completedServiceValueLyd: this.storedMoneyToLyd(completed.reduce((sum, item) => sum + item.price, 0n)),
      },
      inspections: inspections.map((inspection) => ({ id: inspection.id, inspectionType: inspection.inspectionType,
        status: inspection.status, priceLyd: this.storedMoneyToLyd(inspection.price), scheduledAt: inspection.scheduledAt,
        createdAt: inspection.createdAt, requester: inspection.requester, vehicle: inspection.vehicle })),
      reviews: reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, isHidden: review.isHidden,
        moderationReason: review.moderationReason, createdAt: review.createdAt, reviewer: review.reviewer })),
    };
  }

  async review(id: string, reviewerId: string, input: CreateTechnicianReviewDto) {
    const technician = await this.prisma.technician.findUnique({ where: { id }, select: { id: true, userId: true, approvalStatus: true } });
    if (!technician || technician.approvalStatus !== ApprovalStatus.Published) throw new NotFoundException('technician.not_found');
    if (technician.userId === reviewerId) throw new ForbiddenException('review.own_technician_forbidden');
    const completed = await this.prisma.inspectionRequest.findFirst({
      where: { requesterId: reviewerId, technicianId: id, status: 'Completed' }, orderBy: { createdAt: 'desc' },
      select: { id: true, vehicleId: true },
    });
    if (!completed) throw new ForbiddenException('review.completed_inspection_required');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.review.findFirst({ where: { technicianId: id, reviewerId } });
      const saved = existing
        ? await tx.review.update({ where: { id: existing.id }, data: { rating: input.rating, comment: input.comment?.trim() || null,
          vehicleId: completed.vehicleId } })
        : await tx.review.create({ data: { technicianId: id, reviewerId, vehicleId: completed.vehicleId,
          rating: input.rating, comment: input.comment?.trim() || null } });
      const rating = await tx.review.aggregate({ where: { technicianId: id, isHidden: false }, _avg: { rating: true }, _count: { rating: true } });
      await tx.technician.update({ where: { id }, data: { ratingAverage: rating._avg.rating ?? 0, ratingCount: rating._count.rating } });
      await tx.auditLog.create({ data: { actorId: reviewerId, action: existing ? 'technician.review.updated' : 'technician.review.created',
        entityType: 'Review', entityId: saved.id, after: { technicianId: id, inspectionRequestId: completed.id, rating: saved.rating } } });
      return { id: saved.id, rating: saved.rating, comment: saved.comment, createdAt: saved.createdAt };
    });
  }

  async moderateReview(id: string, input: ModerateTechnicianReviewDto, actorId: string) {
    if ((input.rating !== undefined || input.comment !== undefined) && !input.reason?.trim()) throw new BadRequestException('review.edit_reason_required');
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review?.technicianId) throw new NotFoundException('review.not_found');
    const technicianId = review.technicianId;
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({ where: { id }, data: { isHidden: input.hidden,
        ...(input.rating !== undefined ? { rating: input.rating } : {}), ...(input.comment !== undefined ? { comment: input.comment.trim() } : {}),
        hiddenAt: input.hidden ? new Date() : null, moderationReason: input.hidden ? input.reason?.trim() || 'admin_moderation' : null } });
      const rating = await tx.review.aggregate({ where: { technicianId, isHidden: false }, _avg: { rating: true }, _count: { rating: true } });
      await tx.technician.update({ where: { id: technicianId }, data: { ratingAverage: rating._avg.rating ?? 0, ratingCount: rating._count.rating } });
      await tx.auditLog.create({ data: { actorId, action: input.hidden ? 'admin.technician_review.hidden' : 'admin.technician_review.restored',
        entityType: 'Review', entityId: id, before: { isHidden: review.isHidden, rating: review.rating, comment: review.comment }, after: { isHidden: saved.isHidden, rating: saved.rating, comment: saved.comment, reason: input.reason ?? saved.moderationReason } } });
      return saved;
    });
  }

  async create(input: CreateTechnicianDto) {
    await this.assertCity(input.cityId);
    const phone = this.normalizePhone(input.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('technician.phone_already_registered');

    const role = await this.prisma.role.findUnique({ where: { code: 'TECHNICIAN' } });
    if (!role) throw new Error('technician.role_missing');
    const passwordHash = await argon2.hash(input.temporaryPassword, { type: argon2.argon2id });

    const technician = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone,
          fullName: input.name.trim(),
          passwordHash,
          status: 'PendingVerification',
          roles: { create: { roleId: role.id } },
        },
      });
      const created = await tx.technician.create({
        data: {
          userId: user.id,
          name: input.name.trim(),
          phone,
          specialty: input.specialty.trim(),
          yearsExperience: input.yearsExperience,
          cityId: input.cityId,
          serviceRegions: input.serviceRegions ?? [],
          basePrice: this.lydToStoredMoney(input.basePriceLyd),
          availabilityStatus: input.availabilityStatus ?? 'available',
          approvalStatus: ApprovalStatus.PendingReview,
          services: input.services?.length
            ? { create: input.services.map((service) => this.serviceCreateData(service)) }
            : undefined,
        },
        include: technicianInclude,
      });
      await tx.auditLog.create({
        data: {
          action: 'admin.technician.created',
          entityType: 'Technician',
          entityId: created.id,
          after: this.serialize(created, true),
        },
      });
      return created;
    });
    return this.serialize(technician, true);
  }

  async update(id: string, input: UpdateTechnicianDto) {
    const before = await this.prisma.technician.findUnique({ where: { id }, include: technicianInclude });
    if (!before) throw new NotFoundException('technician.not_found');
    if (input.cityId) await this.assertCity(input.cityId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.services) {
        await tx.technicianService.deleteMany({ where: { technicianId: id } });
        for (const service of input.services) {
          await tx.technicianService.create({
            data: { technicianId: id, ...this.serviceCreateData(service) },
          });
        }
      }
      const technician = await tx.technician.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          specialty: input.specialty?.trim(),
          yearsExperience: input.yearsExperience,
          cityId: input.cityId,
          serviceRegions: input.serviceRegions,
          basePrice:
            input.basePriceLyd === undefined ? undefined : this.lydToStoredMoney(input.basePriceLyd),
          availabilityStatus: input.availabilityStatus,
          approvalStatus: input.approvalStatus,
        },
        include: technicianInclude,
      });
      if (input.name) {
        await tx.user.update({ where: { id: before.userId }, data: { fullName: input.name.trim() } });
      }
      await tx.auditLog.create({
        data: {
          action: 'admin.technician.updated',
          entityType: 'Technician',
          entityId: id,
          before: this.serialize(before, true),
          after: this.serialize(technician, true),
        },
      });
      return technician;
    });
    return this.serialize(updated, true);
  }

  async publish(id: string) {
    return this.update(id, { approvalStatus: ApprovalStatus.Published });
  }

  async archive(id: string) {
    return this.update(id, {
      approvalStatus: ApprovalStatus.Archived,
      availabilityStatus: 'unavailable',
    });
  }

  private serialize(technician: TechnicianWithRelations, admin: boolean) {
    return {
      id: technician.id,
      name: technician.name,
      photoUrl: technician.photoUrl,
      specialty: technician.specialty,
      yearsExperience: technician.yearsExperience,
      city: technician.city ? { id: technician.city.id, nameAr: technician.city.nameAr } : null,
      serviceRegions: technician.serviceRegions,
      basePriceLyd: this.storedMoneyToLyd(technician.basePrice),
      availabilityStatus: technician.availabilityStatus,
      approvalStatus: technician.approvalStatus,
      ratingAverage: technician.ratingAverage,
      ratingCount: technician.ratingCount,
      completedInspections: technician.completedInspections,
      services: technician.services.map((service) => ({
        id: service.id,
        name: service.name,
        priceLyd: this.storedMoneyToLyd(service.price),
        durationMinutes: service.durationMinutes,
      })),
      ...(admin ? { phone: technician.phone, accountStatus: technician.user.status, account: { id: technician.user.id, status: technician.user.status,
        phoneVerified: Boolean(technician.user.phoneVerifiedAt), lastLoginAt: technician.user.lastLoginAt,
        createdAt: technician.user.createdAt } } : {}),
    };
  }

  private serviceCreateData(service: TechnicianServiceDto) {
    return {
      name: service.name.trim(),
      price: this.lydToStoredMoney(service.priceLyd),
      durationMinutes: service.durationMinutes,
      isActive: true,
    };
  }

  private async assertCity(cityId: string) {
    const city = await this.prisma.city.findFirst({ where: { id: cityId, isActive: true } });
    if (!city) throw new BadRequestException('city.invalid');
  }

  private normalizePhone(value: string) {
    const compact = value.replace(/[\s()-]/g, '');
    return compact.startsWith('0') ? `+218${compact.slice(1)}` : compact;
  }

  private lydToStoredMoney(amount: number) {
    return BigInt(Math.round(amount * 1000));
  }

  private storedMoneyToLyd(amount: bigint) {
    return Number(amount) / 1000;
  }
}
