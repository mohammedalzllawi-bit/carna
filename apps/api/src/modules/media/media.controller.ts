import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MediaStorageService } from './media-storage.service';

@ApiTags('Media')
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaStorageService) {}

  @Get('images/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async image(@Param('filename') filename: string) {
    const file = await this.media.openLocal(filename);
    return new StreamableFile(file.stream, { type: file.mime, disposition: 'inline' });
  }
}
