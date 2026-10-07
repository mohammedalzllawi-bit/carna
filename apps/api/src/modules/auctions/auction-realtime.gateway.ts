import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { parse } from 'cookie';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AccessTokenPayload } from '../auth/auth.types';
import { notDeleted, notRevoked } from '../../common/mongo-filters';

@WebSocketGateway({ namespace: '/auctions', cors: {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    const allowed = (process.env.CORS_ORIGINS ?? '').split(',').map((item) => item.trim());
    callback(null, !origin || allowed.includes(origin));
  }, credentials: true,
} })
export class AuctionRealtimeGateway implements OnGatewayConnection {
  constructor(private readonly settings: SettingsService, private readonly prisma: PrismaService, private readonly jwt: JwtService) {}
  @WebSocketServer()
  server!: Namespace;

  handleConnection(client: Socket) {
    client.emit('auction:connected', { connected: true });
  }

  @SubscribeMessage('auction:join')
  async join(client: Socket, payload: { auctionId?: unknown }) {
    const auctionId = typeof payload?.auctionId === 'string' ? payload.auctionId : '';
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(auctionId)) return { ok: false };
    if (!(await this.allowed(client.handshake))) { client.disconnect(true); return { ok: false }; }
    const auction = await this.prisma.auction.findFirst({ where: { id: auctionId, vehicle: { approvalStatus: 'Published', ...notDeleted } }, select: { id: true } });
    if (!auction) return { ok: false };
    for (const room of client.rooms) if (room.startsWith('auction:')) await client.leave(room);
    await client.join(this.room(auctionId));
    return { ok: true, auctionId };
  }

  broadcastBid(auctionId: string, event: Record<string, unknown>) {
    void this.broadcast(auctionId, 'auction:bid-accepted', event).catch(() => {});
  }

  broadcastStatus(auctionId: string, event: Record<string, unknown>) {
    void this.broadcast(auctionId, 'auction:status-changed', event).catch(() => {});
  }

  private async broadcast(id: string, name: string, data: Record<string, unknown>) {
    if (!this.server) return;
    const clients = await this.server.in(this.room(id)).fetchSockets();
    for (const client of clients) {
      if (await this.allowed(client.handshake)) client.emit(name, data);
      else client.disconnect(true);
    }
  }

  private async allowed(handshake: { auth: Record<string, unknown>; headers: { cookie?: string } }) {
    if (await this.settings.get<boolean>('platform.maintenance_mode')) return false;
    if (await this.settings.get<boolean>('platform.guest_mode_enabled')) return true;
    try {
      const token = handshake.auth?.token ?? parse(handshake.headers.cookie ?? '').access_token;
      if (typeof token !== 'string') return false;
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      if (!payload.sid || !payload.sub) return false;
      const session = await this.prisma.refreshSession.findFirst({ where: { id: payload.sid, userId: payload.sub, ...notRevoked, expiresAt: { gt: new Date() }, user: { ...notDeleted, status: { notIn: ['Banned', 'Suspended', 'Archived'] } } } });
      return Boolean(session);
    } catch { return false; }
  }

  private room(auctionId: string) {
    return `auction:${auctionId}`;
  }
}
