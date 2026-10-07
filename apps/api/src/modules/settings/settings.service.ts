import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { BrandingStorageService, BrandingUpload } from './branding-storage.service';
import { MediaStorageService } from '../media/media-storage.service';

const definitions = {
  "auction.publisher_subscription_required": { defaultValue: true, schema: z.boolean(), public: true },
  "auction.deposit_basis_points": {
    defaultValue: 1000,
    schema: z.number().int().min(0).max(10000),
    public: true,
  },
  "auction.buyer_fee_milli": {
    defaultValue: 0,
    schema: z.number().int().min(0).max(1000000000),
    public: true,
  },
  "auction.listing_fee_milli": {
    defaultValue: 50_000,
    schema: z.number().int().min(0).max(10_000_000_000),
    public: true,
  },
  "auction.listing_order_expiry_minutes": {
    defaultValue: 2880,
    schema: z.number().int().min(30).max(43_200),
    public: false,
  },
  "vehicle.minimum_listing_images": {
    defaultValue: 4,
    schema: z.number().int().min(1).max(24),
    public: true,
  },
  "platform.guest_mode_enabled": {
    defaultValue: true,
    schema: z.boolean(),
    public: true,
  },
  "platform.maintenance_mode": {
    defaultValue: false,
    schema: z.boolean(),
    public: true,
  },
  "platform.logo_url": {
    defaultValue: "",
    schema: z.string().max(500),
    public: true,
  },
  "auction.section_state": {
    defaultValue: "Open",
    schema: z.enum(["Open", "Closed"]),
    public: true,
  },
  "auction.mode": {
    defaultValue: "Scheduled",
    schema: z.enum(["AlwaysOpen", "Scheduled", "DealerScheduled"]),
    public: true,
  },
  "auction.bid_increment_milli": {
    defaultValue: 100_000,
    schema: z.number().int().min(1_000).max(1_000_000_000),
    public: true,
  },
  "auction.round_seconds": {
    defaultValue: 120,
    schema: z.number().int().min(30).max(3600),
    public: true,
  },
  "auction.bid_wallet_mode": {
    defaultValue: "Fixed",
    schema: z.enum(["Fixed", "Percentage"]),
    public: true,
  },
  "auction.bid_wallet_fixed_milli": {
    defaultValue: 100_000,
    schema: z.number().int().min(0).max(1_000_000_000_000),
    public: true,
  },
  "auction.bid_wallet_basis_points": {
    defaultValue: 1000,
    schema: z.number().int().min(0).max(10000),
    public: true,
  },
  "auction.anti_sniping_enabled": {
    defaultValue: true,
    schema: z.boolean(),
    public: true,
  },
  "auction.anti_sniping_window_seconds": {
    defaultValue: 120,
    schema: z.number().int().min(0).max(3600),
    public: true,
  },
  "auction.anti_sniping_extension_seconds": {
    defaultValue: 120,
    schema: z.number().int().min(0).max(3600),
    public: true,
  },
  "auction.winner_payment_deadline_minutes": {
    defaultValue: 120,
    schema: z.number().int().min(5).max(10_080),
    public: false,
  },
  "auction.fallback_winners": {
    defaultValue: 2,
    schema: z.number().int().min(0).max(2),
    public: false,
  },
  "auction.auto_relist": {
    defaultValue: false,
    schema: z.boolean(),
    public: false,
  },
  "comments.enabled": {
    defaultValue: true,
    schema: z.boolean(),
    public: true,
  },
  "notifications.auction_reminder_minutes": {
    defaultValue: [60, 30, 15, 5],
    schema: z.array(z.number().int().min(1).max(10_080)).max(10),
    public: true,
  },
  "notifications.instant_enabled": { defaultValue: true, schema: z.boolean(), public: false },
  "notifications.scheduled_enabled": { defaultValue: true, schema: z.boolean(), public: false },
  "notifications.auction_enabled": { defaultValue: true, schema: z.boolean(), public: false },
  "notifications.messages_enabled": { defaultValue: true, schema: z.boolean(), public: false },
  "notifications.custom_enabled": { defaultValue: true, schema: z.boolean(), public: false },
} satisfies Record<
  string,
  { defaultValue: unknown; schema: z.ZodType; public: boolean }
>;

export type SettingKey = keyof typeof definitions;

const pendingSettings = new Set<SettingKey>([
  "auction.mode",
]);

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandingStorage: BrandingStorageService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async listAdmin() {
    const records = await this.prisma.setting.findMany();
    const stored = new Map(records.map((record) => [record.key, record.value]));
    return Object.entries(definitions).map(([key, definition]) => ({
      key,
      editable: !pendingSettings.has(key as SettingKey),
      value: stored.has(key)
        ? definition.schema.parse(stored.get(key))
        : definition.defaultValue,
      isDefault: !stored.has(key),
      updatedAt:
        records.find((record) => record.key === key)?.updatedAt ?? null,
    }));
  }

  async listPublic() {
    const settings = await this.listAdmin();
    return Object.fromEntries(
      settings
        .filter((item) => definitions[item.key as SettingKey].public)
        .map((item) => [item.key, item.value]),
    );
  }

  async get<T>(key: SettingKey): Promise<T> {
    const definition = definitions[key];
    const record = await this.prisma.setting.findUnique({ where: { key } });
    return definition.schema.parse(
      record?.value ?? definition.defaultValue,
    ) as T;
  }

  async update(key: string, value: unknown) {
    if (!Object.hasOwn(definitions, key))
      throw new BadRequestException("setting.unknown_key");
    if (pendingSettings.has(key as SettingKey))
      throw new BadRequestException("setting.feature_not_available");
    const definition = definitions[key as SettingKey];
    if (!definition) throw new BadRequestException("setting.unknown_key");
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("setting.invalid_value");

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { key } });
      const setting = await tx.setting.upsert({
        where: { key },
        create: { key, value: parsed.data as Prisma.InputJsonValue },
        update: { value: parsed.data as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          action: "admin.setting.updated",
          entityType: "Setting",
          entityId: setting.id,
          before: before
            ? ({
                key: before.key,
                value: before.value,
              } as Prisma.InputJsonValue)
            : undefined,
          after: {
            key: setting.key,
            value: setting.value,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        key: setting.key,
        value: setting.value,
        updatedAt: setting.updatedAt,
      };
    });
  }

  async uploadLogo(file?: BrandingUpload) {
    if (this.mediaStorage.isCloudinary()) {
      const asset = await this.mediaStorage.storeImage(file, {
        folder: 'branding',
        publicId: 'platform-logo',
        overwrite: true,
        maxBytes: 2 * 1024 * 1024,
      });
      return this.update('platform.logo_url', asset.url);
    }
    const previousUrl = await this.get<string>('platform.logo_url');
    const filename = await this.brandingStorage.storeLogo(file);
    const publicUrl = `/v1/settings/logo/${filename}`;
    try {
      const result = await this.update('platform.logo_url', publicUrl);
      if (await this.get<string>('platform.logo_url') === publicUrl) {
        await this.brandingStorage.remove(this.brandingStorage.filenameFromPublicUrl(previousUrl));
      }
      return result;
    } catch (error) {
      await this.brandingStorage.remove(filename);
      throw error;
    }
  }

  async removeLogo() {
    const previousUrl = await this.get<string>('platform.logo_url');
    const result = await this.update('platform.logo_url', '');
    if (previousUrl.includes('res.cloudinary.com')) await this.mediaStorage.delete(this.mediaStorage.platformLogoKey());
    else await this.brandingStorage.remove(this.brandingStorage.filenameFromPublicUrl(previousUrl));
    return result;
  }

  mediaStatus() {
    return this.mediaStorage.status();
  }

  async openLogo(filename: string) {
    const currentUrl = await this.get<string>('platform.logo_url');
    if (this.brandingStorage.filenameFromPublicUrl(currentUrl) !== filename) {
      throw new NotFoundException('branding.logo_not_found');
    }
    return this.brandingStorage.open(filename);
  }
}
