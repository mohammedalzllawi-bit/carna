import { percentage } from '../../common/money';

export type BidWalletPolicy = { mode: 'Fixed' | 'Percentage'; fixedMilli: bigint; basisPoints: number };

export function requiredBidBalance(auction: { startingPrice: bigint; reservePrice: bigint | null }, policy: BidWalletPolicy) {
  return policy.mode === 'Percentage'
    ? percentage(auction.reservePrice ?? auction.startingPrice, policy.basisPoints)
    : policy.fixedMilli;
}
