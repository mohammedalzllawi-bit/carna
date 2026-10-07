import { Body, Controller, Get, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PaymentsService } from './payments.service';

class CreatePaymentDto {
  @IsUUID() orderId!: string;
  @IsString() @MaxLength(40) provider!: string;
  @IsUUID() idempotencyKey!: string;
}
class WalletPaymentDto { @IsUUID() idempotencyKey!: string; }
class TopupDto extends WalletPaymentDto { @IsString() @Matches(/^\d{1,6}(?:\.\d{1,3})?$/) amountLyd!: string; }

@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get('providers')
  providers() { return this.payments.listProviders(); }
  @Get('orders')
  @UseGuards(AccessTokenGuard)
  orders(@Req() req: AuthenticatedRequest) { return this.payments.ownOrders(req.user.id); }
  @Post()
  @UseGuards(AccessTokenGuard)
  create(@Body() input: CreatePaymentDto, @Req() req: AuthenticatedRequest) {
    return this.payments.create(req.user.id, input.orderId, input.provider, input.idempotencyKey);
  }
  @Post('webhooks/:provider')
  webhook(@Param('provider') provider: string, @Req() request: RawBodyRequest<{ headers: Record<string, string | string[] | undefined>; body: unknown }>) {
    return this.payments.webhook(provider, { headers: request.headers, parsedBody: request.body, rawBody: request.rawBody ?? Buffer.alloc(0) });
  }
  @Post('wallet/topups') @UseGuards(AccessTokenGuard)
  topup(@Body() input: TopupDto, @Req() req: AuthenticatedRequest) { return this.payments.topup(req.user.id, input.amountLyd, input.idempotencyKey); }
  @Post('orders/:id/wallet') @UseGuards(AccessTokenGuard)
  wallet(@Param('id') id: string, @Body() input: WalletPaymentDto, @Req() req: AuthenticatedRequest) { return this.payments.payFromWallet(req.user.id, id, input.idempotencyKey); }
}
