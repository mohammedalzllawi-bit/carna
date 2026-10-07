import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { ApprovalStatus, VehicleCategory, VehicleCondition, VehicleSaleType } from '@prisma/client';

export class VehicleQueryDto {
  @IsOptional()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(['newest', 'oldest', 'price_asc', 'price_desc'])
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc';

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsEnum(VehicleSaleType)
  saleType?: VehicleSaleType;
  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPriceLyd?: number;
}

export class AdminVehicleQueryDto extends VehicleQueryDto {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;
}

export class CreateVehicleDto {
  @IsOptional()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory;
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @IsString()
  @IsNotEmpty()
  make!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsOptional()
  @IsString()
  trim?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year!: number;

  @IsString()
  @IsNotEmpty()
  cityId!: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  exteriorColor?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  transmission?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileageKm?: number;

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsEnum(VehicleSaleType)
  saleType!: VehicleSaleType;

  @IsEnum(VehicleCondition)
  condition!: VehicleCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  priceLyd?: number;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  make?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsString()
  trim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  exteriorColor?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  transmission?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileageKm?: number;

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(VehicleSaleType)
  saleType?: VehicleSaleType;

  @IsOptional()
  @IsEnum(VehicleCondition)
  condition?: VehicleCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  priceLyd?: number;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  approvalStatus?: ApprovalStatus;
}

export class CreateOwnListingDto {
  @IsEnum(VehicleCategory)
  category!: VehicleCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  make!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  model!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year!: number;

  @IsString()
  @IsNotEmpty()
  cityId!: string;

  @IsIn([VehicleSaleType.QuickSale, VehicleSaleType.FixedPrice, VehicleSaleType.Negotiable])
  saleType!: 'QuickSale' | 'FixedPrice' | 'Negotiable';

  @IsEnum(VehicleCondition)
  condition!: VehicleCondition;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  priceLyd!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileageKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;
}

export class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;
}

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  isActive?: boolean;
}
