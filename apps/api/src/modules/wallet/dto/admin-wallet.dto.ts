import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AdminWalletAdjustmentDto {
  @IsIn(['Credit', 'Debit'])
  direction!: 'Credit' | 'Debit';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000_000)
  amountLyd!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsUUID()
  idempotencyKey!: string;
}
