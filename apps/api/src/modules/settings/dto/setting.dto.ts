import { Allow, IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateSettingDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @Allow()
  value!: unknown;
}

export class UpdateKnownSettingDto extends UpdateSettingDto {
  @IsIn([
    'auction.publisher_subscription_required',
    'auction.listing_fee_milli',
    'auction.listing_order_expiry_minutes',
    'vehicle.minimum_listing_images',
    'auction.deposit_basis_points',
    'auction.buyer_fee_milli',
    'platform.guest_mode_enabled',
    'platform.maintenance_mode',
    'auction.section_state',
    'auction.mode',
    'auction.bid_increment_milli',
    'auction.round_seconds',
    'auction.bid_wallet_mode',
    'auction.bid_wallet_fixed_milli',
    'auction.bid_wallet_basis_points',
    'auction.anti_sniping_enabled',
    'auction.anti_sniping_window_seconds',
    'auction.anti_sniping_extension_seconds',
    'auction.winner_payment_deadline_minutes',
    'auction.fallback_winners',
    'auction.auto_relist',
    'comments.enabled',
    'notifications.auction_reminder_minutes',
    'notifications.instant_enabled',
    'notifications.scheduled_enabled',
    'notifications.auction_enabled',
    'notifications.messages_enabled',
    'notifications.custom_enabled',
  ])
  declare key: string;
}
