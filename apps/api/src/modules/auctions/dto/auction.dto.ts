import { Type } from 'class-transformer';
import { VehicleCategory, VehicleCondition } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const moneyPattern = /^\d{1,15}(?:\.\d{1,3})?$/;

export class PlaceBidDto {
  @IsString()
  @Matches(moneyPattern)
  amountLyd!: string;

  @IsUUID()
  idempotencyKey!: string;
}

export class CreateAuctionDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  rollingRound?: boolean;

  @IsString()
  @Matches(moneyPattern)
  startingPriceLyd!: string;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern)
  bidIncrementLyd?: string;

  @IsOptional()
  @IsString()
  @Matches(moneyPattern)
  reservePriceLyd?: string;
}

export class ChangeAuctionStatusDto {
  @IsIn(['Live', 'Paused', 'Cancelled', 'Relisted'])
  status!: 'Live' | 'Paused' | 'Cancelled' | 'Relisted';
}

export class AuctionQueryDto {
  @IsOptional()
  @IsIn(['Scheduled', 'Live', 'Paused', 'Completed', 'Cancelled', 'NoWinner', 'PaymentPending', 'Sold', 'Relisted'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class CreateAuctionListingRequestDto {
  @IsOptional() @IsEnum(VehicleCategory) category?: VehicleCategory;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() rollingRound?: boolean;
  @IsString() @Matches(moneyPattern) startingPriceLyd!: string;
  @IsOptional() @IsString() @Matches(moneyPattern) bidIncrementLyd?: string;
  @IsOptional() @IsString() @Matches(moneyPattern) reservePriceLyd?: string;
  @IsString() @MaxLength(80) make!: string;
  @IsString() @MaxLength(80) model!: string;
  @IsOptional() @IsString() @MaxLength(80) trim?: string;
  @Type(() => Number) @IsInt() @Min(1950) @Max(2100) year!: number;
  @IsUUID() cityId!: string;
  @IsOptional() @IsUUID() regionId?: string;
  @IsOptional() @IsString() @MaxLength(60) exteriorColor?: string;
  @IsOptional() @IsString() @MaxLength(60) interiorColor?: string;
  @IsOptional() @IsString() @MaxLength(60) fuelType?: string;
  @IsOptional() @IsString() @MaxLength(60) transmission?: string;
  @IsOptional() @IsString() @MaxLength(60) drivetrain?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) mileageKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20_000) engineCapacityCc?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(16) cylinders?: number;
  @IsOptional() @IsString() @MaxLength(60) bodyType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) doors?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) seats?: number;
  @IsOptional() @IsString() @MaxLength(80) registrationStatus?: string;
  @IsOptional() @IsString() @MaxLength(80) ownershipStatus?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsEnum(VehicleCondition) condition!: VehicleCondition;
}

export class RejectAuctionListingDto {
  @IsString() @MaxLength(500) reason!: string;
}
