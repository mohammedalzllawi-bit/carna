import { z } from 'zod';

export const phoneSchema = z.string().min(8).max(20);

export const vehicleSearchSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  cityId: z.string().uuid().optional(),
  minYear: z.number().int().optional(),
  maxYear: z.number().int().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  saleType: z.enum(['Auction', 'QuickSale', 'FixedPrice', 'Negotiable']).optional(),
  sort: z
    .enum(['newest', 'price_asc', 'price_desc', 'most_viewed', 'nearest_auction', 'most_bids'])
    .optional(),
});

export const bidPreviewSchema = z.object({
  auctionId: z.string().uuid(),
  amount: z.string(),
});

