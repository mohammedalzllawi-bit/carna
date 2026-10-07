import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type FeeContext = {
  baseMilli?: bigint;
  planId?: string;
  userId?: string;
  dealerId?: string;
};

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveMilli(code: string, context: FeeContext = {}): Promise<bigint | null> {
    const fee = await this.prisma.fee.findUnique({ where: { code } });
    if (!fee?.isActive) return null;
    const rules = fee.rules && typeof fee.rules === 'object' && !Array.isArray(fee.rules)
      ? fee.rules as Record<string, unknown>
      : {};
    if (!this.matches(rules.planIds, context.planId) || !this.matches(rules.userIds, context.userId) || !this.matches(rules.dealerIds, context.dealerId)) {
      return null;
    }
    let amount = fee.amount;
    if (amount === null && fee.rate !== null) {
      const basisPoints = BigInt(Math.round(fee.rate * 100));
      amount = (context.baseMilli ?? 0n) * basisPoints / 10_000n;
    }
    if (amount === null) return null;
    const minimum = this.bigIntRule(rules.minimumMilli);
    const maximum = this.bigIntRule(rules.maximumMilli);
    if (minimum !== null && amount < minimum) amount = minimum;
    if (maximum !== null && amount > maximum) amount = maximum;
    return amount;
  }

  private matches(value: unknown, candidate?: string) {
    if (!Array.isArray(value) || value.length === 0) return true;
    return Boolean(candidate && value.includes(candidate));
  }

  private bigIntRule(value: unknown) {
    return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : null;
  }
}
