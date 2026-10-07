import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AdminKeyGuard } from '../catalog/admin-key.guard';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { UsersAdminService } from './users-admin.service';

@ApiTags('Admin Users')
@ApiHeader({ name: 'x-admin-key', required: true })
@UseGuards(AdminKeyGuard)
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  list() { return this.users.list(); }

  @Post()
  create(@Body() input: CreateAdminUserDto) { return this.users.create(input); }

  @Get(':id')
  detail(@Param('id') id: string) { return this.users.detail(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdateAdminUserDto) { return this.users.update(id, input); }

  @Delete(':id')
  archive(@Param('id') id: string) { return this.users.archive(id); }
}
