import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ListingChatService } from './listing-chat.service';
import { AdminKeyGuard } from '../catalog/admin-key.guard';

class StartConversationDto {
  @IsString() @IsNotEmpty() vehicleId!: string;
}

class SendMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) body!: string;
}

@ApiTags('Listing Chat')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller({ path: 'listing-chats', version: '1' })
export class ListingChatController {
  constructor(private readonly chat: ListingChatService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.chat.list(request.user.id);
  }

  @Post()
  start(@Body() input: StartConversationDto, @Req() request: AuthenticatedRequest) {
    return this.chat.start(request.user.id, input.vehicleId);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.chat.detail(request.user.id, id);
  }

  @Post(':id/messages')
  send(@Param('id') id: string, @Body() input: SendMessageDto, @Req() request: AuthenticatedRequest) {
    return this.chat.send(request.user.id, id, input.body);
  }

  @Post(':id/voice')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 4 * 1024 * 1024, files: 1 } }))
  voice(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @Req() request: AuthenticatedRequest) {
    return this.chat.sendVoice(request.user.id, id, file);
  }
}

@ApiTags('Admin Listing Chat')
@ApiBearerAuth()
@UseGuards(AdminKeyGuard, AccessTokenGuard)
@Controller({ path: 'admin/messages', version: '1' })
export class AdminListingChatController {
  constructor(private readonly chat: ListingChatService) {}
  @Get()
  list(@Query('page') page: string | undefined) { return this.chat.listAdmin(page ? Number(page) : 1); }
  @Get(':id')
  detail(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.chat.detailAdmin(id, request.user.id);
  }
}
