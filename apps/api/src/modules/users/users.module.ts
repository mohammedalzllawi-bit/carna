import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminUsersController } from './admin-users.controller';
import { UsersAdminService } from './users-admin.service';
import { AuditController, RolesController } from './roles.controller';
import { AuthModule } from '../auth/auth.module';
import { AccountController } from './account.controller';

@Module({
  imports: [CatalogModule, AuthModule],
  controllers: [AdminUsersController, RolesController, AuditController, AccountController],
  providers: [UsersAdminService],
})
export class UsersModule {}
