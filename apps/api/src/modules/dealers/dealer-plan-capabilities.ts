export const dealerPlanCapabilities = [
  { code: 'CAN_CREATE_LISTING', label: 'إضافة وعرض السيارات' },
  { code: 'CAN_CREATE_AUCTION', label: 'إنشاء مزاد' },
  { code: 'CAN_LIVE_AUCTION', label: 'إنشاء مزاد مباشر' },
  { code: 'CAN_PARTICIPATE_AUCTIONS', label: 'المشاركة في المزادات' },
  { code: 'CAN_BUY_CARS', label: 'شراء السيارات' },
  { code: 'CAN_REQUEST_INSPECTION', label: 'طلب فحص السيارة' },
  { code: 'CAN_REQUEST_INSPECTION_REPORT', label: 'طلب كشف أو تقرير' },
  { code: 'CAN_RECEIVE_DEPOSIT', label: 'استقبال العربون' },
  { code: 'CAN_USE_WALLET', label: 'استخدام المحفظة' },
  { code: 'CAN_ADD_MULTIPLE_CARS', label: 'إضافة عدة سيارات' },
] as const;

export type DealerPlanCapability = string;

export const legacyDealerCapabilities: DealerPlanCapability[] = [
  'CAN_CREATE_LISTING',
  'CAN_CREATE_AUCTION',
  'CAN_PARTICIPATE_AUCTIONS',
  'CAN_BUY_CARS',
  'CAN_REQUEST_INSPECTION',
  'CAN_REQUEST_INSPECTION_REPORT',
  'CAN_RECEIVE_DEPOSIT',
  'CAN_USE_WALLET',
  'CAN_ADD_MULTIPLE_CARS',
];

export type DealerPlanFeatures = {
  description: string | null;
  audience: 'Dealer' | 'Customer' | 'Both';
  auctionVehicleLimit: number | null;
  permissions: DealerPlanCapability[];
};

export function readDealerPlanFeatures(value: unknown): DealerPlanFeatures {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const configured = Array.isArray(source.permissions)
    ? source.permissions.filter((code): code is DealerPlanCapability =>
        typeof code === 'string' && /^CAN_[A-Z0-9_]{2,80}$/.test(code))
    : legacyDealerCapabilities;
  const audience = source.audience === 'Customer' || source.audience === 'Both' ? source.audience : 'Dealer';
  return {
    description: typeof source.description === 'string' && source.description.trim() ? source.description.trim() : null,
    audience,
    auctionVehicleLimit: typeof source.auctionVehicleLimit === 'number' && Number.isInteger(source.auctionVehicleLimit)
      ? source.auctionVehicleLimit
      : null,
    permissions: Array.from(new Set(configured)),
  };
}
