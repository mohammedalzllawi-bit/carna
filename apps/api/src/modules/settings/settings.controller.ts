import { Body, Controller, Delete, Get, Header, Param, Patch, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { UpdateKnownSettingDto } from './dto/setting.dto';
import { SettingsService } from './settings.service';

@ApiTags('Public Settings')
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  publicSettings() {
    return this.settings.listPublic();
  }

  @Get('logo/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async logo(@Param('filename') filename: string) {
    const file = await this.settings.openLogo(filename);
    return new StreamableFile(file.stream, { type: file.mime, disposition: 'inline' });
  }
}

@ApiTags('Admin Settings')
@ApiHeader({ name: 'x-admin-key', required: true })
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin/settings', version: '1' })
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.listAdmin();
  }

  @Get('media-status')
  mediaStatus() {
    return this.settings.mediaStatus();
  }

  @Patch()
  update(@Body() input: UpdateKnownSettingDto) {
    return this.settings.update(input.key, input.value);
  }

  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  uploadLogo(@UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.settings.uploadLogo(file);
  }

  @Delete('logo')
  removeLogo() {
    return this.settings.removeLogo();
  }
}
