import { Body, Controller, Get, Param, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CatalogService } from './catalog.service';
import { CreateOwnListingDto } from './dto/catalog.dto';

@ApiTags('My Listings')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions('vehicles.create_own')
@Controller({ path: 'listings', version: '1' })
export class ListingsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('mine')
  mine(@Req() request: AuthenticatedRequest) {
    return this.catalog.listOwnListings(request.user.id);
  }

  @Post()
  create(@Body() input: CreateOwnListingDto, @Req() request: AuthenticatedRequest) {
    return this.catalog.createOwnListing(request.user.id, input);
  }

  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 12, { limits: { fileSize: 8 * 1024 * 1024, files: 12 } }))
  images(@Param('id') id: string, @UploadedFiles() files: { buffer: Buffer; mimetype: string; size: number }[], @Req() request: AuthenticatedRequest) {
    return this.catalog.uploadOwnListingImages(request.user.id, id, files);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.catalog.submitOwnListing(request.user.id, id);
  }
}
