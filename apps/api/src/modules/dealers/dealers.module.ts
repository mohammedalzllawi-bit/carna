import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { MediaModule } from '../media/media.module';
import { AdminDealersController, DealerPortalController, DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';

@Module({
  imports: [AuthModule, CatalogModule, SettingsModule, MediaModule],
  controllers: [DealersController, DealerPortalController, AdminDealersController],
  providers: [DealersService],
  exports: [DealersService],
})
export class DealersModule {}
