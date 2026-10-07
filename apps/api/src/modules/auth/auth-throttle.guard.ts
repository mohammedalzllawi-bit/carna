import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthThrottleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ ip: string; body?: { phone?: string }; route?: { path?: string } }>();
    const action = req.route?.path ?? 'auth';
    const windows = [{ value: `ip:${req.ip}:${action}`, limit: 200 }];
    if (typeof req.body?.phone === 'string') {
      const phone = req.body.phone.replace(/^0/, '+218');
      windows.push({ value: `phone:${phone}:${action}`, limit: 15 });
    }
    const period = 15 * 60_000;
    for (const entry of windows) {
      const bucket = Math.floor(Date.now() / period);
      const id = createHash('sha256').update(`${entry.value}:${bucket}`).digest('hex');
      const data = { attempts: { increment: 1 } };
      let counter;
      try {
        counter = await this.prisma.rateLimitWindow.upsert({ where: { id }, update: data,
          create: { id, attempts: 1, expiresAt: new Date((bucket + 1) * period) } });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        counter = await this.prisma.rateLimitWindow.update({ where: { id }, data });
      }
      if (counter.attempts > entry.limit) throw new HttpException('auth.rate_limited', 429);
    }
    return true;
  }
}
