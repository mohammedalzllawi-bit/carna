import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from './access-token.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [ConfigModule, JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_ACCESS_SECRET') }),
  })],
  providers: [AccessTokenGuard, PermissionsGuard],
  exports: [AccessTokenGuard, PermissionsGuard, JwtModule],
})
export class SecurityModule {}
