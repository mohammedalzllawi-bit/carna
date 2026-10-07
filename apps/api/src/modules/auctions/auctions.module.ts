import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';
import { AdminAuctionListingsController, AdminAuctionsController, AuctionListingsController, AuctionsController } from './auctions.controller';
import { AuctionLifecycleService } from './auction-lifecycle.service';
import { FeesModule } from '../fees/fees.module';
import { MediaModule } from '../media/media.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [AuthModule, CatalogModule, SettingsModule, FeesModule, MediaModule, SubscriptionsModule],
  controllers: [AuctionsController, AdminAuctionsController, AuctionListingsController, AdminAuctionListingsController],
  providers: [AuctionsService, AuctionRealtimeGateway, AuctionLifecycleService],
  exports: [AuctionsService],
})
export class AuctionsModule {}
