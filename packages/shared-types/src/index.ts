export type CurrencyCode = 'LYD' | string;

export interface Money {
  amount: string;
  currency: CurrencyCode;
}

export interface FeeBreakdown {
  bidAmount?: Money;
  finalPrice?: Money;
  platformFee: Money;
  buyerFee: Money;
  deposit: Money;
  totalDueNow: Money;
  remainingAmount?: Money;
}

export interface PublicVehicleSummary {
  id: string;
  lotNumber: string;
  make: string;
  model: string;
  year: number;
  cityName?: string;
  thumbnailUrl?: string;
  saleType: 'Auction' | 'QuickSale' | 'FixedPrice' | 'Negotiable';
}

export interface LiveAuctionState {
  auctionId: string;
  status: 'Scheduled' | 'Live' | 'Paused' | 'Completed' | 'Cancelled' | 'NoWinner' | 'PaymentPending' | 'Sold' | 'Relisted';
  currentBidAmount?: Money;
  bidIncrement: Money;
  bidCount: number;
  endsAt: string;
  reserveMet?: boolean;
}

