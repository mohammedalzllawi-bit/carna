import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './auth.types';

const PERMISSIONS_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    if (!required.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!required.every((permission) => request.user.permissions.includes(permission))) {
      throw new ForbiddenException('auth.permission_denied');
    }
    return true;
  }
}
