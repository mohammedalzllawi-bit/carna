import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type ImageUpload = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

export type StoredImage = {
  storageKey: string;
  url: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  bytes: number;
  provider: 'cloudinary' | 'local';
};

export type StoredVoice = { storageKey: string; durationSeconds: number };

type StoreOptions = {
  folder: string;
  publicId?: string;
  overwrite?: boolean;
  maxBytes?: number;
};

const supportedImages = [
  { mime: 'image/png', extension: 'png', matches: (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', extension: 'jpg', matches: (buffer: Buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { mime: 'image/webp', extension: 'webp', matches: (buffer: Buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP' },
];

@Injectable()
export class MediaStorageService {
  private readonly provider: 'cloudinary' | 'local';
  private readonly localDirectory: string;
  private readonly cloudinaryFolder: string;
  private readonly cloudName: string | null;

  constructor(private readonly config: ConfigService) {
    this.provider = config.get<'cloudinary' | 'local'>('MEDIA_STORAGE_PROVIDER') ?? 'local';
    this.localDirectory = resolve(config.get<string>('MEDIA_STORAGE_DIR') ?? join(process.cwd(), 'storage', 'media'));
    this.cloudinaryFolder = (config.get<string>('CLOUDINARY_FOLDER') ?? 'libya-auctions').replace(/^\/+|\/+$/g, '');
    const cloudinaryUrl = config.get<string>('CLOUDINARY_URL');
    const parsedCloudinaryUrl = cloudinaryUrl ? new URL(cloudinaryUrl) : null;
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME') ?? parsedCloudinaryUrl?.hostname ?? null;
    if (this.provider === 'cloudinary') {
      cloudinary.config({
        cloud_name: this.cloudName ?? undefined,
        api_key: config.get<string>('CLOUDINARY_API_KEY') ?? (parsedCloudinaryUrl ? decodeURIComponent(parsedCloudinaryUrl.username) : undefined),
        api_secret: config.get<string>('CLOUDINARY_API_SECRET') ?? (parsedCloudinaryUrl ? decodeURIComponent(parsedCloudinaryUrl.password) : undefined),
        secure: true,
      });
    }
  }

  status() {
    return {
      provider: this.provider,
      cloudName: this.provider === 'cloudinary' ? this.cloudName : null,
      folder: this.provider === 'cloudinary' ? this.cloudinaryFolder : null,
    };
  }

  isCloudinary() {
    return this.provider === 'cloudinary';
  }

  async storeImage(file: ImageUpload | undefined, options: StoreOptions): Promise<StoredImage> {
    const format = this.validateImage(file, options.maxBytes ?? 8 * 1024 * 1024);
    if (this.provider === 'cloudinary') return this.storeCloudinary(file!, options);
    return this.storeLocal(file!, format.extension, options.folder);
  }

  async storeVoice(file: ImageUpload | undefined, conversationId: string): Promise<StoredVoice> {
    if (this.provider !== 'cloudinary') throw new ServiceUnavailableException('media.private_audio_requires_cloudinary');
    if (!file?.buffer?.length || file.size > 4 * 1024 * 1024 || file.buffer.length !== file.size) {
      throw new BadRequestException('media.audio_size_invalid');
    }
    const mime = file.mimetype.split(';')[0].toLowerCase();
    const mp4 = ['audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(mime) && file.buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    const webm = mime === 'audio/webm' && file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const ogg = mime === 'audio/ogg' && file.buffer.subarray(0, 4).toString('ascii') === 'OggS';
    if (!mp4 && !webm && !ogg) throw new BadRequestException('media.audio_invalid_type');
    let result: UploadApiResponse;
    try {
      result = await new Promise<UploadApiResponse>((resolveUpload, rejectUpload) => {
        const stream = cloudinary.uploader.upload_stream({ resource_type: 'video', type: 'authenticated',
          folder: `${this.cloudinaryFolder}/chat-${this.safeSegment(conversationId)}`, unique_filename: true,
          use_filename: false }, (error, uploaded) => {
          if (error || !uploaded) rejectUpload(error ?? new Error('Cloudinary returned no upload result'));
          else resolveUpload(uploaded);
        });
        stream.end(file.buffer);
      });
    } catch { throw new ServiceUnavailableException('media.audio_upload_failed'); }
    const duration = Number(result.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: 'video', type: 'authenticated' });
      throw new BadRequestException('media.audio_duration_invalid');
    }
    return { storageKey: `voice:${result.public_id}:${result.format}`, durationSeconds: Math.ceil(duration) };
  }

  voiceUrl(storageKey: string) {
    if (!storageKey.startsWith('voice:')) throw new NotFoundException('media.audio_not_found');
    const value = storageKey.slice(6);
    const separator = value.lastIndexOf(':');
    if (separator <= 0) throw new NotFoundException('media.audio_not_found');
    return cloudinary.utils.private_download_url(value.slice(0, separator), value.slice(separator + 1), {
      resource_type: 'video', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300,
    });
  }

  async deleteVoice(storageKey: string) {
    if (!storageKey.startsWith('voice:')) return;
    const value = storageKey.slice(6);
    const separator = value.lastIndexOf(':');
    if (separator > 0) await cloudinary.uploader.destroy(value.slice(0, separator), { resource_type: 'video', type: 'authenticated' });
  }

  async delete(storageKey: string | null | undefined) {
    if (!storageKey) return;
    if (storageKey.startsWith('cloudinary:')) {
      const publicId = storageKey.slice('cloudinary:'.length);
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
      return;
    }
    if (storageKey.startsWith('local:')) {
      await rm(this.localPath(storageKey.slice('local:'.length)), { force: true });
    }
  }

  async openLocal(filename: string) {
    const path = this.localPath(filename);
    try {
      await stat(path);
    } catch {
      throw new NotFoundException('media.image_not_found');
    }
    const format = supportedImages.find((candidate) => filename.endsWith(`.${candidate.extension}`));
    if (!format) throw new NotFoundException('media.image_not_found');
    return { stream: createReadStream(path), mime: format.mime };
  }

  platformLogoKey() {
    return `cloudinary:${this.cloudinaryFolder}/branding/platform-logo`;
  }

  private validateImage(file: ImageUpload | undefined, maxBytes: number) {
    if (!file?.buffer?.length) throw new BadRequestException('media.image_required');
    if (file.size > maxBytes) throw new BadRequestException('media.image_too_large');
    const format = supportedImages.find((candidate) => candidate.mime === file.mimetype && candidate.matches(file.buffer));
    if (!format) throw new BadRequestException('media.image_invalid_type');
    return format;
  }

  private async storeCloudinary(file: ImageUpload, options: StoreOptions): Promise<StoredImage> {
    const uploadOptions: UploadApiOptions = {
      resource_type: 'image',
      folder: `${this.cloudinaryFolder}/${this.safeSegment(options.folder)}`,
      public_id: options.publicId,
      overwrite: options.overwrite ?? false,
      invalidate: options.overwrite ?? false,
      unique_filename: !options.publicId,
      use_filename: false,
      tags: ['libya-auctions', this.safeSegment(options.folder)],
    };
    let result: UploadApiResponse;
    try {
      result = await new Promise<UploadApiResponse>((resolveUpload, rejectUpload) => {
        const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, uploaded) => {
          if (error || !uploaded) rejectUpload(error ?? new Error('Cloudinary returned no upload result'));
          else resolveUpload(uploaded);
        });
        stream.end(file.buffer);
      });
    } catch {
      throw new ServiceUnavailableException('media.cloudinary_upload_failed');
    }
    const thumbnailUrl = cloudinary.url(result.public_id, {
      secure: true,
      version: result.version,
      transformation: [
        { width: 640, height: 480, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });
    return {
      storageKey: `cloudinary:${result.public_id}`,
      url: result.secure_url,
      thumbnailUrl,
      width: result.width ?? null,
      height: result.height ?? null,
      bytes: result.bytes,
      provider: 'cloudinary',
    };
  }

  private async storeLocal(file: ImageUpload, extension: string, folder: string): Promise<StoredImage> {
    await mkdir(this.localDirectory, { recursive: true });
    const filename = `${this.safeSegment(folder)}-${Date.now()}-${randomUUID()}.${extension}`;
    const temporary = join(this.localDirectory, `.${filename}.tmp`);
    await writeFile(temporary, file.buffer, { flag: 'wx' });
    await rename(temporary, this.localPath(filename));
    const url = `/v1/media/images/${filename}`;
    return { storageKey: `local:${filename}`, url, thumbnailUrl: url, width: null, height: null, bytes: file.size, provider: 'local' };
  }

  private safeSegment(value: string) {
    const segment = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!segment) throw new BadRequestException('media.invalid_folder');
    return segment;
  }

  private localPath(filename: string) {
    const safeName = basename(filename);
    if (safeName !== filename || !/^[a-z0-9_-]+-\d+-[a-f0-9-]+\.(?:png|jpg|webp)$/.test(safeName)) {
      throw new NotFoundException('media.image_not_found');
    }
    return join(this.localDirectory, safeName);
  }
}
