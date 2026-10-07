import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminTechniciansController } from './admin-technicians.controller';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CatalogModule, AuthModule],
  controllers: [TechniciansController, AdminTechniciansController],
  providers: [TechniciansService],
  exports: [TechniciansService],
})
export class TechniciansModule {}
