import { Body, Controller, HttpCode, HttpException, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthThrottleGuard } from '../auth/auth-throttle.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PhoneOtpService } from './phone-otp.service';
import { ResalaApiError } from './resala.client';

class VerifyOtpDto {
  @IsString()
  @Matches(/^\d{4,6}$/)
  code!: string;
}

@ApiTags('Phone verification')
@ApiBearerAuth()
@Controller({ path: 'auth/phone', version: '1' })
export class PhoneOtpController {
  constructor(private readonly otp: PhoneOtpService) {}

  @Post('request-otp')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, AuthThrottleGuard)
  async request(@Req() request: AuthenticatedRequest) {
    if (!request.user.phone) throw new HttpException('otp.phone_required', 400);
    try { return await this.otp.requestOtp(request.user.phone); }
    catch (error) { this.rethrowProviderError(error); }
  }

  @Post('verify-otp')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, AuthThrottleGuard)
  verify(@Req() request: AuthenticatedRequest, @Body() input: VerifyOtpDto) {
    if (!request.user.phone) throw new HttpException('otp.phone_required', 400);
    return this.otp.verifyOtp(request.user.phone, input.code);
  }

  private rethrowProviderError(error: unknown): never {
    if (error instanceof ResalaApiError) throw new HttpException({ message: error.message, errors: error.fieldErrors }, error.status ?? 503);
    throw error;
  }
}
