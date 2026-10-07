import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type BrandingUpload = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const supportedImages = [
  { mime: 'image/png', extension: 'png', matches: (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', extension: 'jpg', matches: (buffer: Buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { mime: 'image/webp', extension: 'webp', matches: (buffer: Buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP' },
];

@Injectable()
export class BrandingStorageService {
  private readonly directory: string;

  constructor(config: ConfigService) {
    this.directory = resolve(config.get<string>('BRANDING_STORAGE_DIR') ?? join(process.cwd(), 'storage', 'branding'));
  }

  async storeLogo(file?: BrandingUpload) {
    if (!file?.buffer?.length) throw new BadRequestException('branding.logo_required');
    if (file.size > 2 * 1024 * 1024) throw new BadRequestException('branding.logo_too_large');
    const format = supportedImages.find((candidate) => candidate.mime === file.mimetype && candidate.matches(file.buffer));
    if (!format) throw new BadRequestException('branding.logo_invalid_type');

    await mkdir(this.directory, { recursive: true });
    const filename = `logo-${Date.now()}-${randomUUID()}.${format.extension}`;
    const temporary = join(this.directory, `.${filename}.tmp`);
    await writeFile(temporary, file.buffer, { flag: 'wx' });
    await rename(temporary, join(this.directory, filename));
    return filename;
  }

  async remove(filename: string | null) {
    if (!filename) return;
    await rm(this.pathFor(filename), { force: true });
  }

  async open(filename: string) {
    const format = supportedImages.find((candidate) => filename.endsWith(`.${candidate.extension}`));
    if (!format) throw new NotFoundException('branding.logo_not_found');
    const path = this.pathFor(filename);
    try {
      await stat(path);
    } catch {
      throw new NotFoundException('branding.logo_not_found');
    }
    return { stream: createReadStream(path), mime: format.mime };
  }

  filenameFromPublicUrl(value: string) {
    if (!value) return null;
    const pathname = value.split('?')[0];
    const filename = basename(pathname);
    return filename.startsWith('logo-') ? filename : null;
  }

  private pathFor(filename: string) {
    const safeName = basename(filename);
    if (safeName !== filename || !safeName.startsWith('logo-')) throw new NotFoundException('branding.logo_not_found');
    return join(this.directory, safeName);
  }
}
