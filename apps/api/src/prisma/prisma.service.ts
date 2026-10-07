import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { requestContext } from '../common/request-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    this.$use(async (params, next) => {
      const appendOnly = ['AuditLog', 'WalletLedger', 'PaymentTransaction', 'BidHistory'];
      if (appendOnly.includes(params.model ?? '') && /^(update|delete|upsert)/.test(params.action)) {
        throw new Error('record.append_only');
      }
      if (params.model === 'AuditLog' && params.action === 'create') {
        params.args.data = { ...requestContext.getStore(), ...params.args.data };
      }
      return next(params);
    });
  }
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
