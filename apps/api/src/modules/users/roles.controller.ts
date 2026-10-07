import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminKeyGuard } from '../catalog/admin-key.guard';

class RoleDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,39}$/) code!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) permissions!: string[];
}

@Controller({ path: 'admin/roles', version: '1' })
@UseGuards(AdminKeyGuard)
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async list() {
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { code: 'asc' } }),
      this.prisma.permission.findMany({ orderBy: { code: 'asc' } }),
    ]);
    return { roles: roles.map((r) => ({ id: r.id, code: r.code, name: r.name, users: r._count.users, permissions: r.permissions.map((p) => p.permission.code) })), permissions };
  }
  @Post()
  create(@Body() body: RoleDto) { return this.save(null, body); }
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: RoleDto) { return this.save(id, body); }

  private async save(id: string | null, body: RoleDto) {
    if (body.code === 'SUPER_ADMIN') throw new BadRequestException('role.super_admin_protected');
    const codes = Array.from(new Set(body.permissions));
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== codes.length) throw new BadRequestException('role.permission_unknown');
    return this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: true } }) : null;
      if (before?.code === 'SUPER_ADMIN') throw new BadRequestException('role.super_admin_protected');
      const role = id ? await tx.role.update({ where: { id }, data: { code: body.code, name: body.name } }) : await tx.role.create({ data: { code: body.code, name: body.name } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const p of permissions) await tx.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
      await tx.auditLog.create({ data: { action: id ? 'admin.role.updated' : 'admin.role.created', entityType: 'Role', entityId: role.id,
        before: before ? { code: before.code, permissions: before.permissions.map((p) => p.permissionId) } : undefined, after: { code: role.code, permissions: codes } } });
      return role;
    });
  }
}

@Controller({ path: 'admin/audit', version: '1' })
@UseGuards(AdminKeyGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  list() { return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { fullName: true } } } }); }
}
