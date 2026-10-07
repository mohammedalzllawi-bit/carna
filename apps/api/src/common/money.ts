import { BadRequestException } from '@nestjs/common';

export function toMilli(value: string | number): bigint {
  const text = String(value);
  if (!/^\d{1,12}(?:\.\d{1,3})?$/.test(text)) throw new BadRequestException('money.invalid');
  const [whole, fractional = ''] = text.split('.');
  const amount = BigInt(whole) * 1000n + BigInt(fractional.padEnd(3, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('money.too_large');
  return amount;
}

export function toLyd(amount: bigint) { return Number(amount) / 1000; }

export function percentage(amount: bigint, basisPoints: number): bigint {
  return (amount * BigInt(basisPoints) + 9999n) / 10000n;
}
