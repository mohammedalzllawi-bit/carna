import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Allow, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { notDeleted, notRead } from '../../common/mongo-filters';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { FirebasePushService } from './firebase-push.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { audienceWhere, NotificationAudience, notificationAudiences } from './notification-audience';

class SendNotificationDto {
  @IsOptional() @IsIn(notificationAudiences) audience?: NotificationAudience;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) recipient?: string;
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsString() @MinLength(1) @MaxLength(1000) body!: string;
}

class ScheduleNotificationDto extends SendNotificationDto {
  @IsDateString() dueAt!: string;
}

class NotificationSettingDto {
  @IsIn(['notifications.instant_enabled', 'notifications.scheduled_enabled', 'notifications.auction_enabled',
    'notifications.messages_enabled', 'notifications.custom_enabled', 'notifications.auction_reminder_minutes']) key!: string;
  @Allow() value!: unknown;
}

class PushDeviceDto {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
  @IsIn(['android', 'ios']) platform!: string;
}

class RemovePushDeviceDto {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
}

@Controller({ path: 'notifications', version: '1' })
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  @Post('devices')
  async registerDevice(@Body() input: PushDeviceDto, @Req() req: AuthenticatedRequest) {
    await this.prisma.pushDevice.upsert({ where: { token: input.token },
      create: { userId: req.user.id, token: input.token, platform: input.platform },
      update: { userId: req.user.id, platform: input.platform } });
    return { registered: true };
  }
  @Delete('devices')
  async removeDevice(@Body() input: RemovePushDeviceDto, @Req() req: AuthenticatedRequest) {
    await this.prisma.pushDevice.deleteMany({ where: { token: input.token, userId: req.user.id } });
    return { removed: true };
  }
  @Patch('read-all')
  readAll(@Req() req: AuthenticatedRequest) {
    return this.prisma.notification.updateMany({ where: { userId: req.user.id, ...notRead }, data: { readAt: new Date() } });
  }
  @Patch(':id/read')
  read(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.prisma.notification.updateMany({ where: { id, userId: req.user.id, ...notRead }, data: { readAt: new Date() } });
  }
}

@Controller({ path: 'admin/notifications', version: '1' })
@UseGuards(AdminKeyGuard, AccessTokenGuard)
export class AdminNotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService,
    private readonly firebase: FirebasePushService) {}

  @Get()
  async overview(@Req() req: AuthenticatedRequest) {
    const [recent, unread, total, scheduled, campaigns, audienceCounts, devices, pushSent, pushFailed, settingRows] = await Promise.all([
      this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, title: true, body: true, createdAt: true, readAt: true,
          pushState: true, pushAttempts: true, pushSentAt: true, pushError: true,
          user: { select: { id: true, fullName: true, phone: true } } } }),
      this.prisma.notification.count({ where: { userId: req.user.id, ...notRead } }),
      this.prisma.notification.count(),
      this.prisma.scheduledNotification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notificationCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      Promise.all((['dealers', 'users', 'technicians', 'all'] as const).map(async (audience) =>
        [audience, await this.prisma.user.count({ where: audienceWhere(audience) })] as const)),
      this.prisma.pushDevice.count(),
      this.prisma.notification.count({ where: { pushState: 'Sent' } }),
      this.prisma.notification.count({ where: { pushState: 'Failed' } }),
      this.settings.listAdmin(),
    ]);
    return {
      recent, unread, total, scheduled, campaigns, audienceCounts: Object.fromEntries(audienceCounts),
      devices, pushSent, pushFailed,
      settings: settingRows.filter((row) => row.key.startsWith('notifications.')),
      channels: { inApp: 'active', firebasePush: this.firebase.status() },
    };
  }

  @Patch('settings')
  updateSetting(@Body() input: NotificationSettingDto) { return this.settings.update(input.key, input.value); }

  @Post('test')
  async test(@Req() req: AuthenticatedRequest) {
    const notification = await this.prisma.notification.create({ data: { userId: req.user.id,
      title: 'اختبار إشعارات كارنا', body: 'تم إنشاء إشعار الاختبار بنجاح.', data: { type: 'admin_test' } } });
    return { id: notification.id, pushState: notification.pushState };
  }

  @Post('schedule')
  async schedule(@Body() input: ScheduleNotificationDto, @Req() req: AuthenticatedRequest) {
    const dueAt = new Date(input.dueAt);
    if (dueAt <= new Date()) throw new BadRequestException('notifications.schedule_must_be_future');
    if (!await this.settings.get<boolean>('notifications.custom_enabled')) throw new BadRequestException('notifications.custom_disabled');
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new BadRequestException('notifications.message_required');
    const audience = input.audience ?? 'individual';
    if (audience !== 'individual') return this.createCampaign(audience, 'Scheduled', title, body, dueAt, req.user.id);
    const user = await this.findRecipient(input.recipient);
    return this.prisma.$transaction(async (tx) => {
      const scheduled = await tx.scheduledNotification.create({ data: { recipientId: user.id,
        actorId: req.user.id, title, body, dueAt } });
      await tx.auditLog.create({ data: { actorId: req.user.id, action: 'admin.notification.scheduled',
        entityType: 'ScheduledNotification', entityId: scheduled.id, after: { recipientId: user.id, dueAt: dueAt.toISOString() } } });
      return { id: scheduled.id, dueAt: scheduled.dueAt, status: scheduled.status };
    });
  }

  @Patch('schedule/:id/cancel')
  async cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.scheduledNotification.updateMany({ where: { id, status: 'Scheduled' }, data: { status: 'Cancelled' } });
      if (!cancelled.count) throw new NotFoundException('notifications.schedule_not_found');
      await tx.auditLog.create({ data: { actorId: req.user.id, action: 'admin.notification.schedule_cancelled',
        entityType: 'ScheduledNotification', entityId: id } });
      return { cancelled: true };
    });
  }

  @Patch('campaign/:id/cancel')
  async cancelCampaign(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.notificationCampaign.updateMany({ where: { id, status: 'Scheduled' },
        data: { status: 'Cancelled' } });
      if (!cancelled.count) throw new NotFoundException('notifications.campaign_not_found');
      await tx.auditLog.create({ data: { actorId: req.user.id, action: 'admin.notification.campaign_cancelled',
        entityType: 'NotificationCampaign', entityId: id } });
      return { cancelled: true };
    });
  }

  @Patch('read-all')
  readAll(@Req() req: AuthenticatedRequest) {
    return this.prisma.notification.updateMany({ where: { userId: req.user.id, ...notRead }, data: { readAt: new Date() } });
  }

  @Post()
  async send(@Body() input: SendNotificationDto, @Req() req: AuthenticatedRequest) {
    if (!await this.settings.get<boolean>('notifications.custom_enabled')) throw new BadRequestException('notifications.custom_disabled');
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new BadRequestException('notifications.message_required');
    const audience = input.audience ?? 'individual';
    if (audience !== 'individual') return this.createCampaign(audience, 'Instant', title, body, new Date(), req.user.id);
    const user = await this.findRecipient(input.recipient);
    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({ data: { userId: user.id, title, body,
        data: { type: 'admin_message' } } });
      await tx.auditLog.create({ data: { actorId: req.user.id, action: 'admin.notification.sent',
        entityType: 'Notification', entityId: notification.id,
        after: { recipientId: user.id, title } } });
      return { id: notification.id, recipientId: user.id, channel: 'InApp', pushState: notification.pushState };
    });
  }

  private async createCampaign(audience: NotificationAudience, mode: 'Instant' | 'Scheduled',
    title: string, body: string, dueAt: Date, actorId: string) {
    const recipientCount = await this.prisma.user.count({ where: audienceWhere(audience) });
    if (!recipientCount && mode === 'Instant') throw new BadRequestException('notifications.no_recipients');
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.notificationCampaign.create({ data: { actorId, audience, mode, title, body, dueAt } });
      await tx.auditLog.create({ data: { actorId, action: 'admin.notification.campaign_created',
        entityType: 'NotificationCampaign', entityId: campaign.id,
        after: { audience, mode, dueAt: dueAt.toISOString(), recipientCount } } });
      return { id: campaign.id, status: campaign.status, audience, recipientCount, dueAt: campaign.dueAt };
    });
  }

  private async findRecipient(value?: string) {
    const recipient = value?.trim();
    if (!recipient) throw new BadRequestException('notifications.recipient_required');
    const user = await this.prisma.user.findFirst({ where: {
      AND: [notDeleted, { OR: [{ id: recipient }, { phone: recipient }] }],
      status: { notIn: ['Banned', 'Suspended', 'Archived'] },
    }, select: { id: true } });
    if (!user) throw new NotFoundException('notifications.recipient_not_found');
    return user;
  }
}

@Module({ imports: [AuthModule, CatalogModule, SettingsModule], controllers: [NotificationsController, AdminNotificationsController],
  providers: [FirebasePushService, NotificationDispatchService] })
export class NotificationsModule {}
