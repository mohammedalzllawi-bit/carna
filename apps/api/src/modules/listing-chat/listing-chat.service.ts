import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeleted } from '../../common/mongo-filters';
import { ImageUpload, MediaStorageService } from '../media/media-storage.service';

@Injectable()
export class ListingChatService {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaStorageService) {}

  async start(buyerId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, approvalStatus: 'Published', ...notDeleted },
      include: { dealer: { select: { ownerUserId: true } } },
    });
    if (!vehicle) throw new NotFoundException('listing.not_found');
    const sellerId = vehicle.dealer?.ownerUserId ?? vehicle.ownerUserId;
    if (!sellerId) throw new BadRequestException('listing.chat_unavailable');
    if (sellerId === buyerId) throw new ForbiddenException('listing.cannot_message_self');
    return this.prisma.listingConversation.upsert({
      where: { vehicleId_buyerId: { vehicleId, buyerId } },
      create: { vehicleId, buyerId, sellerId },
      update: {},
      select: { id: true, vehicleId: true, buyerId: true, sellerId: true },
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.listingConversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true, category: true, images: { where: { isSensitive: false }, take: 1, orderBy: { sortOrder: 'asc' } } } },
        buyer: { select: { id: true, fullName: true } },
        seller: { select: { id: true, fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({ id: row.id, vehicle: { ...row.vehicle, imageUrl: row.vehicle.images[0]?.thumbnailKey ?? null, images: undefined },
      otherName: row.buyerId === userId ? row.seller.fullName : row.buyer.fullName,
      lastMessage: row.messages[0]?.audioKey ? 'رسالة صوتية' : row.messages[0]?.body ?? null, updatedAt: row.updatedAt }));
  }

  async detail(userId: string, id: string) {
    const row = await this.prisma.listingConversation.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, senderId: true, body: true,
          audioKey: true, audioDurationSeconds: true, createdAt: true } },
      },
    });
    if (!row || (row.buyerId !== userId && row.sellerId !== userId)) throw new NotFoundException('listing.chat_not_found');
    return { id: row.id, vehicle: row.vehicle, buyerId: row.buyerId, sellerId: row.sellerId, currentUserId: userId,
      messages: row.messages.map((message) => ({ ...message, audioKey: undefined,
        audioUrl: message.audioKey ? this.media.voiceUrl(message.audioKey) : null })) };
  }

  async send(userId: string, id: string, body: string) {
    const conversation = await this.prisma.listingConversation.findUnique({ where: { id }, select: { buyerId: true, sellerId: true, vehicleId: true } });
    if (!conversation || (conversation.buyerId !== userId && conversation.sellerId !== userId)) throw new NotFoundException('listing.chat_not_found');
    const text = body.trim();
    if (!text) throw new BadRequestException('listing.empty_message');
    const recipientId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.listingMessage.create({ data: { conversationId: id, senderId: userId, body: text },
        select: { id: true, senderId: true, body: true, createdAt: true } });
      await tx.listingConversation.update({ where: { id }, data: { updatedAt: new Date() } });
      await tx.notification.create({ data: { userId: recipientId, title: 'رسالة جديدة عن مركبة', body: text.slice(0, 100),
        data: { type: 'listing_message', conversationId: id, vehicleId: conversation.vehicleId } } });
      return message;
    });
  }

  async sendVoice(userId: string, id: string, file?: ImageUpload) {
    const conversation = await this.prisma.listingConversation.findUnique({ where: { id },
      select: { buyerId: true, sellerId: true, vehicleId: true } });
    if (!conversation || (conversation.buyerId !== userId && conversation.sellerId !== userId)) {
      throw new NotFoundException('listing.chat_not_found');
    }
    const asset = await this.media.storeVoice(file, id);
    const recipientId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const message = await tx.listingMessage.create({ data: { conversationId: id, senderId: userId,
          body: '', audioKey: asset.storageKey, audioDurationSeconds: asset.durationSeconds },
          select: { id: true, senderId: true, body: true, audioKey: true, audioDurationSeconds: true, createdAt: true } });
        await tx.listingConversation.update({ where: { id }, data: { updatedAt: new Date() } });
        await tx.notification.create({ data: { userId: recipientId, title: 'رسالة صوتية جديدة عن مركبة',
          body: `رسالة صوتية (${asset.durationSeconds} ثانية)`,
          data: { type: 'listing_message', conversationId: id, vehicleId: conversation.vehicleId } } });
        return { ...message, audioKey: undefined, audioUrl: this.media.voiceUrl(asset.storageKey) };
      });
    } catch (error) {
      await this.media.deleteVoice(asset.storageKey);
      throw error;
    }
  }

  async listAdmin(page = 1) {
    const safePage = Number.isInteger(page) ? Math.min(100, Math.max(1, page)) : 1;
    const [rows, total] = await Promise.all([
      this.prisma.listingConversation.findMany({ include: {
        vehicle: { select: { id: true, make: true, model: true, year: true, lotNumber: true } },
        buyer: { select: { id: true, fullName: true } }, seller: { select: { id: true, fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      }, orderBy: { updatedAt: 'desc' }, take: 50, skip: (safePage - 1) * 50 }),
      this.prisma.listingConversation.count(),
    ]);
    return { page: safePage, total, items: rows.map((row) => ({ id: row.id, vehicle: row.vehicle,
      buyer: row.buyer, seller: row.seller, updatedAt: row.updatedAt,
      lastMessage: row.messages[0]?.audioKey ? 'رسالة صوتية' : row.messages[0]?.body ?? null })) };
  }

  async detailAdmin(id: string, actorId: string) {
    const row = await this.prisma.listingConversation.findUnique({ where: { id }, include: {
      vehicle: { select: { id: true, make: true, model: true, year: true, lotNumber: true } },
      buyer: { select: { id: true, fullName: true } }, seller: { select: { id: true, fullName: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 200,
        select: { id: true, senderId: true, body: true, audioKey: true, audioDurationSeconds: true, createdAt: true } },
    } });
    if (!row) throw new NotFoundException('listing.chat_not_found');
    await this.prisma.auditLog.create({ data: { actorId, action: 'admin.chat.viewed',
      entityType: 'ListingConversation', entityId: id, after: { messageCount: row.messages.length } } });
    return { id: row.id, vehicle: row.vehicle, buyer: row.buyer, seller: row.seller,
      messages: row.messages.map((message) => ({ ...message, audioKey: undefined,
        audioUrl: message.audioKey ? this.media.voiceUrl(message.audioKey) : null })) };
  }
}
