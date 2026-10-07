import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FirebasePushService } from './firebase-push.service';
import { audienceWhere, NotificationAudience } from './notification-audience';
import { notDeleted } from '../../common/mongo-filters';

@Injectable()
export class NotificationDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly firebase: FirebasePushService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick().catch((error: Error) => this.logger.error(error.message)), 5000);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.deliverScheduled();
      await this.deliverCampaigns();
      await this.deliverAuctionReminders();
      await this.deliverPush();
    } finally { this.busy = false; }
  }

  async deliverScheduled() {
    if (!await this.settings.get<boolean>('notifications.scheduled_enabled')) return;
    const due = await this.prisma.scheduledNotification.findMany({
      where: { status: 'Scheduled', dueAt: { lte: new Date() } }, orderBy: { dueAt: 'asc' }, take: 50,
    });
    for (const item of due) {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.scheduledNotification.updateMany({ where: { id: item.id, status: 'Scheduled' },
          data: { status: 'Sent', sentAt: new Date() } });
        if (!claim.count) return;
        await tx.notification.create({ data: { userId: item.recipientId, title: item.title, body: item.body,
          data: { type: 'admin_scheduled', scheduledId: item.id } } });
        await tx.auditLog.create({ data: { actorId: item.actorId, action: 'admin.notification.scheduled_sent',
          entityType: 'ScheduledNotification', entityId: item.id } });
      });
    }
  }

  async deliverCampaigns() {
    if (!await this.settings.get<boolean>('notifications.custom_enabled')) return;
    const modes: string[] = [];
    if (await this.settings.get<boolean>('notifications.instant_enabled')) modes.push('Instant');
    if (await this.settings.get<boolean>('notifications.scheduled_enabled')) modes.push('Scheduled');
    if (!modes.length) return;
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 2 * 60000);
    const claimable = { OR: [{ status: 'Scheduled' }, { status: 'Processing', claimedAt: { lt: staleBefore } }] };
    const campaigns = await this.prisma.notificationCampaign.findMany({ where: {
      dueAt: { lte: now }, mode: { in: modes }, ...claimable,
    }, orderBy: { dueAt: 'asc' }, take: 5 });
    for (const campaign of campaigns) {
      const claimToken = randomUUID();
      const claimed = await this.prisma.notificationCampaign.updateMany({ where: {
        id: campaign.id, ...claimable,
      }, data: { status: 'Processing', claimedAt: new Date(), claimToken } });
      if (!claimed.count) continue;
      try {
        const audience = campaign.audience as NotificationAudience;
        const users = await this.prisma.user.findMany({ where: { AND: [
          audienceWhere(audience, campaign.recipientId ?? undefined),
          ...(campaign.cursor ? [{ id: { gt: campaign.cursor } }] : []),
        ] }, orderBy: { id: 'asc' }, take: 100, select: { id: true } });
        for (const user of users) {
          try {
            await this.prisma.$transaction(async (tx) => {
              const eligible = await tx.user.findFirst({ where: { AND: [
                audienceWhere(audience, campaign.recipientId ?? undefined), { id: user.id },
              ] }, select: { id: true } });
              if (!eligible) return;
              await tx.notificationCampaignDelivery.create({ data: { campaignId: campaign.id, userId: user.id } });
              await tx.notification.create({ data: { userId: user.id, title: campaign.title, body: campaign.body,
                data: { type: campaign.mode === 'Scheduled' ? 'admin_scheduled' : 'admin_message',
                  campaignId: campaign.id } } });
            });
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
          }
        }
        const deliveredCount = await this.prisma.notificationCampaignDelivery.count({ where: { campaignId: campaign.id } });
        const completed = users.length < 100;
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.notificationCampaign.updateMany({ where: {
            id: campaign.id, status: 'Processing', claimToken,
          }, data: {
            cursor: users.at(-1)?.id ?? campaign.cursor, processedCount: campaign.processedCount + users.length,
            deliveredCount, status: completed ? 'Sent' : 'Scheduled',
            claimedAt: null, claimToken: null, completedAt: completed ? new Date() : null,
          } });
          if (completed && updated.count) await tx.auditLog.create({ data: { actorId: campaign.actorId,
            action: 'admin.notification.campaign_sent', entityType: 'NotificationCampaign',
            entityId: campaign.id, after: { audience: campaign.audience, deliveredCount } } });
        });
      } catch (error) {
        this.logger.error(`Campaign ${campaign.id}: ${(error as Error).message}`);
      }
    }
  }

  async deliverAuctionReminders() {
    if (!await this.settings.get<boolean>('notifications.auction_enabled')) return;
    const now = new Date();
    const reminderMinutes = await this.settings.get<number[]>('notifications.auction_reminder_minutes');
    const scheduledEnabled = await this.settings.get<boolean>('notifications.scheduled_enabled');
    const instantEnabled = await this.settings.get<boolean>('notifications.instant_enabled');
    const maxMinutes = scheduledEnabled ? Math.max(0, ...reminderMinutes) : 0;
    if (!maxMinutes && !instantEnabled) return;
    const auctions = await this.prisma.auction.findMany({ where: { OR: [
      ...(maxMinutes ? [{ status: 'Scheduled' as const, startsAt: { gt: now, lte: new Date(now.getTime() + maxMinutes * 60000) } }] : []),
      ...(instantEnabled ? [{ status: 'Live' as const, startsAt: { lte: now, gte: new Date(now.getTime() - 5 * 60000) } }] : []),
    ] }, select: { id: true, vehicleId: true, startsAt: true, vehicle: { select: { make: true, model: true } } }, take: 40 });
    for (const auction of auctions) {
      const minutes = auction.startsAt <= now ? [0] : reminderMinutes.filter((value) =>
        auction.startsAt.getTime() <= now.getTime() + value * 60000 &&
        auction.startsAt.getTime() > now.getTime() + Math.max(0, value - 1) * 60000);
      if (!minutes.length) continue;
      const watches = await this.prisma.watchlist.findMany({ where: { OR: [
        { auctionId: auction.id }, { vehicleId: auction.vehicleId },
      ], user: { status: { in: ['Active', 'PendingVerification'] }, ...notDeleted } }, select: { userId: true }, take: 500 });
      for (const userId of new Set(watches.map((item) => item.userId))) {
        for (const minute of minutes) {
          try {
            await this.prisma.$transaction(async (tx) => {
              await tx.auctionNotice.create({ data: { auctionId: auction.id, userId, kind: minute === 0 ? 'start' : `reminder_${minute}` } });
              await tx.notification.create({ data: { userId,
                title: minute === 0 ? 'بدأ المزاد الذي تتابعه' : 'مزاد تتابعه يقترب',
                body: `${auction.vehicle.make} ${auction.vehicle.model}${minute ? ` يبدأ خلال ${minute} دقيقة` : ' متاح الآن للمزايدة'}.`,
                data: { type: minute === 0 ? 'auction_started' : 'auction_reminder', auctionId: auction.id,
                  route: `/auctions/${auction.id}` } } });
            });
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
          }
        }
      }
    }
  }

  async deliverPush() {
    if (!this.firebase.status().configured) return;
    const now = new Date();
    const notices = await this.prisma.notification.findMany({ where: {
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      OR: [
        { pushState: 'Pending', OR: [{ pushNextAttemptAt: null }, { pushNextAttemptAt: { isSet: false } },
          { pushNextAttemptAt: { lte: now } }] },
        { pushState: 'Sending', pushClaimedAt: { lt: new Date(now.getTime() - 2 * 60000) } },
      ],
    }, orderBy: { createdAt: 'asc' }, take: 50 });
    for (const notice of notices) {
      const claim = await this.prisma.notification.updateMany({ where: { id: notice.id, pushState: notice.pushState },
        data: { pushState: 'Sending', pushClaimedAt: new Date() } });
      if (!claim.count) continue;
      const type = this.noticeType(notice.data);
      const user = await this.prisma.user.findUnique({ where: { id: notice.userId }, select: { preferences: true, status: true, deletedAt: true } });
      const preferences = user?.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences) ? user.preferences : {};
      const optedOut = !user || user.deletedAt || ['Banned', 'Suspended', 'Archived'].includes(user.status) || preferences.pushEnabled === false ||
        ((type.startsWith('auction_') || type === 'outbid') && preferences.auctionNotifications === false) ||
        (type === 'listing_message' && preferences.messageNotifications === false);
      if (optedOut || !await this.pushEnabled(type)) {
        await this.prisma.notification.update({ where: { id: notice.id }, data: { pushState: 'Skipped', pushError: 'disabled_by_admin' } });
        continue;
      }
      const devices = await this.prisma.pushDevice.findMany({ where: { userId: notice.userId }, take: 10 });
      if (!devices.length) {
        await this.prisma.notification.update({ where: { id: notice.id }, data: { pushState: 'NoDevice' } });
        continue;
      }
      const route = this.noticeRoute(notice.data);
      const conversationId = this.noticeConversationId(notice.data);
      let delivered = false;
      let lastError = '';
      for (const device of devices) {
        try {
          await this.firebase.send(device.token, notice.title,
            type === 'listing_message' ? 'لديك رسالة جديدة في محادثة مركبة.' : notice.body,
            { type, notificationId: notice.id, route,
            ...(conversationId ? { conversationId } : {}) });
          delivered = true;
        } catch (error) {
          const code = (error as { code?: string }).code ?? 'send_failed';
          lastError = code;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            await this.prisma.pushDevice.delete({ where: { token: device.token } });
          }
        }
      }
      const attempts = notice.pushAttempts + 1;
      await this.prisma.notification.update({ where: { id: notice.id }, data: {
        pushAttempts: attempts, pushState: delivered ? 'Sent' : attempts >= 3 ? 'Failed' : 'Pending',
        pushSentAt: delivered ? new Date() : null, pushError: delivered ? null : lastError.slice(0, 120),
        pushNextAttemptAt: delivered || attempts >= 3 ? null : new Date(Date.now() + attempts * 60000),
      } });
    }
  }

  private noticeType(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value) && typeof value.type === 'string' ? value.type : 'system';
  }

  private noticeRoute(value: Prisma.JsonValue | null) {
    const route = value && typeof value === 'object' && !Array.isArray(value) ? value.route : null;
    return typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') ? route : '/account';
  }

  private noticeConversationId(value: Prisma.JsonValue | null) {
    const id = value && typeof value === 'object' && !Array.isArray(value) ? value.conversationId : null;
    return typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id) ? id : null;
  }

  private async pushEnabled(type: string) {
    if (type === 'admin_scheduled') return this.settings.get<boolean>('notifications.scheduled_enabled');
    if (!await this.settings.get<boolean>('notifications.instant_enabled')) return false;
    if (type === 'listing_message') return this.settings.get<boolean>('notifications.messages_enabled');
    if (type.startsWith('auction_') || type === 'outbid') return this.settings.get<boolean>('notifications.auction_enabled');
    if (type === 'admin_message') return this.settings.get<boolean>('notifications.custom_enabled');
    return true;
  }
}
