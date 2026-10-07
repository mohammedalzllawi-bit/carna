import { Module } from '@nestjs/common';
import { AdminListingChatController, ListingChatController } from './listing-chat.controller';
import { ListingChatService } from './listing-chat.service';
import { SecurityModule } from '../auth/security.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';

@Module({ imports: [SecurityModule, CatalogModule, MediaModule], controllers: [ListingChatController, AdminListingChatController], providers: [ListingChatService] })
export class ListingChatModule {}
