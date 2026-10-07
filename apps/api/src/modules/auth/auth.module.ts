import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SettingsModule } from '../settings/settings.module';
import { SecurityModule } from './security.module';
import { AuthThrottleGuard } from './auth-throttle.guard';

@Module({
  imports: [
    SecurityModule,
    SettingsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthThrottleGuard],
  exports: [AuthService, SecurityModule],
})
export class AuthModule {}
