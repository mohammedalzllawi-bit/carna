import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RequestSubscriptionDto {
  @IsUUID() planId!: string;
  @IsUUID() idempotencyKey!: string;
}
export class ManageMemberSubscriptionDto {
  @IsUUID() userId!: string;
  @IsIn(['activate', 'extend', 'suspend', 'resume', 'cancel', 'set_usage']) action!: string;
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) value?: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
