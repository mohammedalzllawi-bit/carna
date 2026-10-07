import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthThrottleGuard } from '../auth/auth-throttle.guard';
import { SecurityModule } from '../auth/security.module';
import { PhoneOtpController } from './phone-otp.controller';
import { PhoneOtpService } from './phone-otp.service';
import { ResalaClient } from './resala.client';
import { RESALA_CLIENT } from './resala.tokens';

@Module({
  imports: [SecurityModule],
  controllers: [PhoneOtpController],
  providers: [
    AuthThrottleGuard,
    PhoneOtpService,
    { provide: RESALA_CLIENT, inject: [ConfigService], useFactory: (config: ConfigService) => new ResalaClient({
      baseUrl: config.get<string>('RESALA_BASE_URL') ?? 'https://dev.resala.ly/api/v1',
      token: config.get<string>('RESALA_API_TOKEN'),
      production: config.get<string>('NODE_ENV') === 'production',
      serviceName: config.get<string>('RESALA_SERVICE_NAME') ?? 'Carna',
      autofillHash: config.get<string>('RESALA_AUTOFILL_HASH'),
    }) },
  ],
  exports: [RESALA_CLIENT, PhoneOtpService],
})
export class ResalaModule {}
