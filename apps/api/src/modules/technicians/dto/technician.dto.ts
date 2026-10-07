import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApprovalStatus } from '@prisma/client';

const libyanPhonePattern = /^(?:0|\+218)9[1-6]\d{7}$/;

export class TechnicianQueryDto {
  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  specialty?: string;
}

export class TechnicianServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  priceLyd!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(1440)
  durationMinutes?: number;
}

export class CreateTechnicianDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(libyanPhonePattern, { message: 'phone must be a valid Libyan mobile number' })
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  temporaryPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  specialty!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number;

  @IsString()
  @IsNotEmpty()
  cityId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  serviceRegions?: string[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  basePriceLyd!: number;

  @IsOptional()
  @IsString()
  availabilityStatus?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TechnicianServiceDto)
  services?: TechnicianServiceDto[];
}

export class UpdateTechnicianDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  specialty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  serviceRegions?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  basePriceLyd?: number;

  @IsOptional()
  @IsString()
  availabilityStatus?: string;

  @IsOptional()
  @IsEnum(ApprovalStatus)
  approvalStatus?: ApprovalStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TechnicianServiceDto)
  services?: TechnicianServiceDto[];
}

export class UpdateTechnicianAvailabilityDto {
  @IsBoolean()
  available!: boolean;
}

export class CreateTechnicianReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ModerateTechnicianReviewDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsBoolean()
  hidden!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
