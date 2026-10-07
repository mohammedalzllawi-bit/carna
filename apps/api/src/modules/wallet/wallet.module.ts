import { Body, Controller, Get, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { WalletService } from './wallet.service';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminWalletAdjustmentDto } from './dto/admin-wallet.dto';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
class WithdrawalDto {
  @IsString() @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) amountLyd!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsUUID() idempotencyKey!: string;
}
class ResolveWithdrawalDto {
  @IsIn(['paid', 'reject']) action!: 'paid' | 'reject';
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(200) transferReference?: string;
}

@Controller({ path: 'wallet', version: '1' })
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get()
  @RequirePermissions('wallet.read_own')
  own(@Req() request: AuthenticatedRequest) { return this.wallet.own(request.user.id); }
  @Post('withdrawals') @RequirePermissions('wallet.read_own')
  withdraw(@Req() request: AuthenticatedRequest, @Body() input: WithdrawalDto) { return this.wallet.requestWithdrawal(request.user.id, input); }
}

@Controller({ path: 'admin/wallet', version: '1' })
@UseGuards(AdminKeyGuard)
export class AdminWalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get('withdrawals')
  withdrawals() { return this.wallet.withdrawalsAdmin(); }
  @Post('withdrawals/:id')
  resolve(@Param('id') id: string, @Req() request: AuthenticatedRequest, @Body() input: ResolveWithdrawalDto) { return this.wallet.resolveWithdrawal(id, request.user.id, input); }

  @Get('users/:userId')
  detail(@Param('userId') userId: string) { return this.wallet.adminSummary(userId); }

  @Post('users/:userId/adjustments')
  adjust(@Param('userId') userId: string, @Req() request: AuthenticatedRequest, @Body() input: AdminWalletAdjustmentDto) {
    return this.wallet.adminAdjust(userId, request.user.id, input);
  }
}

@Module({ imports: [AuthModule, CatalogModule], controllers: [WalletController, AdminWalletController], providers: [WalletService], exports: [WalletService] })
export class WalletModule {}
