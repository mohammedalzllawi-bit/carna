import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminSettingsController, SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { BrandingStorageService } from './branding-storage.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [CatalogModule, MediaModule],
  controllers: [SettingsController, AdminSettingsController],
  providers: [SettingsService, BrandingStorageService],
  exports: [SettingsService],
})
export class SettingsModule {}
