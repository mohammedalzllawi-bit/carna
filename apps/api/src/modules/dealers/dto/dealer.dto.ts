import { BillingModel, DealerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const libyanPhonePattern = /^(?:0|\+218)9[1-6]\d{7}$/;
const moneyPattern = /^\d{1,12}(?:\.\d{1,3})?$/;

export class SaveDealerPlanDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,39}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsIn(['Dealer', 'Customer', 'Both']) audience!: 'Dealer' | 'Customer' | 'Both';
  @IsString() @Matches(moneyPattern) priceLyd!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) durationDays!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) vehicleLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) auctionLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) auctionVehicleLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) staffLimit?: number;
  @IsBoolean() searchBoostEnabled!: boolean;
  @IsBoolean() adsIncluded!: boolean;
  @IsOptional() @IsString() @Matches(moneyPattern) extraVehicleFeeLyd?: string;
  @IsOptional() @Type(() => Number) @Min(0) @Max(100) commissionRate?: number;
  @IsEnum(BillingModel) billingModel!: BillingModel;
  @IsBoolean() isActive!: boolean;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  @Matches(/^CAN_[A-Z0-9_]{2,80}$/, { each: true })
  permissions!: string[];
}

export class SavePlanCapabilityDto {
  @IsString() @Matches(/^CAN_[A-Z0-9_]{2,80}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsBoolean() isActive!: boolean;
}

export class SaveCapabilityOverrideDto {
  @IsString() @Matches(/^CAN_[A-Z0-9_]{2,80}$/) capability!: string;
  @IsIn(['Allow', 'Deny', 'Inherit']) effect!: 'Allow' | 'Deny' | 'Inherit';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AdminCreateDealerDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(100) ownerName!: string;
  @IsString() @Matches(libyanPhonePattern) phone!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsUUID() regionId?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsString() @MaxLength(100) licenseNumber?: string;
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsBoolean() activateSubscription?: boolean;
  @IsOptional() @IsEnum(DealerStatus) status?: DealerStatus;
}

export class UpdateDealerStatusDto {
  @IsEnum(DealerStatus) status!: DealerStatus;
}

export class ManageDealerSubscriptionDto {
  @IsIn(['activate', 'extend', 'change', 'suspend', 'cancel', 'remind'])
  action!: 'activate' | 'extend' | 'change' | 'suspend' | 'cancel' | 'remind';
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) days?: number;
}

export class UpdateOwnDealerDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsUUID() regionId?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsString() @MaxLength(100) licenseNumber?: string;
}

export class RequestDealerSubscriptionDto {
  @IsUUID() planId!: string;
}

export class CreateDealerReviewDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class ModerateDealerReviewDto {
  @IsBoolean() hidden!: boolean;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class DealerAuctionRequestDto {
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() rollingRound?: boolean;
  @IsString() @Matches(moneyPattern) startingPriceLyd!: string;
  @IsOptional() @IsString() @Matches(moneyPattern) bidIncrementLyd?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) reservePriceLyd?: string;
}
