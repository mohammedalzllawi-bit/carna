import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
export class SaleRequestDto {
  @IsUUID() vehicleId!: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}
export class RequestActionDto { @IsIn(['accept', 'reject', 'deliver', 'start', 'cancel', 'complete']) action!: string; }
export class TechnicianAvailabilityDto { @IsIn(['available', 'unavailable']) status!: string; }
export class InspectionDto {
  @IsUUID() vehicleId!: string;
  @IsUUID() technicianId!: string;
  @IsUUID() idempotencyKey!: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class ReportDto {
  @IsString() @MinLength(10) @MaxLength(5000) technicianNotes!: string;
  @IsString() @MaxLength(5000) recommendations!: string;
  @IsInt() @Min(0) @Max(100) overallScore!: number;
  @IsString() @MinLength(2) @MaxLength(500) engine!: string;
  @IsString() @MinLength(2) @MaxLength(500) transmission!: string;
  @IsString() @MinLength(2) @MaxLength(500) electric!: string;
  @IsString() @MinLength(2) @MaxLength(500) chassis!: string;
}
export class ProfileSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) fullName?: string;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() auctionNotifications?: boolean;
  @IsOptional() @IsBoolean() messageNotifications?: boolean;
}
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(72) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(72) newPassword!: string;
}
export class ContentDto {
  @IsIn(['terms', 'privacy', 'consumer-protection', 'auction-rules']) slug!: string;
  @IsIn(['ar', 'en']) locale!: string;
  @IsString() @MinLength(2) @MaxLength(150) title!: string;
  @IsString() @MinLength(10) @MaxLength(50000) body!: string;
  @IsBoolean() published!: boolean;
}
export class ReviewEditDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MaxLength(1000) comment!: string;
  @IsBoolean() hidden!: boolean;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
