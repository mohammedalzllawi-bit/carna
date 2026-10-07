import { Module } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminCatalogController } from './admin-catalog.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { SecurityModule } from '../auth/security.module';
import { MediaModule } from '../media/media.module';
import { ListingsController } from './listings.controller';

@Module({
  imports: [SecurityModule, MediaModule],
  controllers: [CatalogController, AdminCatalogController, ListingsController],
  providers: [CatalogService, AdminKeyGuard],
  exports: [CatalogService, AdminKeyGuard, SecurityModule],
})
export class CatalogModule {}
