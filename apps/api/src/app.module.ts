import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuctionsModule } from './modules/auctions/auctions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AuthModule } from './modules/auth/auth.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnvironment } from './config/environment';
import { SettingsModule } from './modules/settings/settings.module';
import { APP_GUARD } from '@nestjs/core';
import { PlatformAccessGuard } from './modules/settings/platform-access.guard';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DealersModule } from './modules/dealers/dealers.module';
import { MediaModule } from './modules/media/media.module';
import { resolve } from 'node:path';
import { FeesModule } from './modules/fees/fees.module';
import { ListingChatModule } from './modules/listing-chat/listing-chat.module';
import { ResalaModule } from './modules/resala/resala.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../../../.env'),
      validate: validateEnvironment,
    }),
    PrismaModule,
    MediaModule,
    SettingsModule,
    FeesModule,
    AuthModule,
    ResalaModule,
    TechniciansModule,
    UsersModule,
    CatalogModule,
    AuctionsModule,
    PaymentsModule,
    NotificationsModule,
    DealersModule,
    ListingChatModule,
    SubscriptionsModule,
    WorkspaceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: PlatformAccessGuard }],
})
export class AppModule {}
