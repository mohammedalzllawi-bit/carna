import { AccountStatus } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  phone: string | null;
  roles: string[];
  status: AccountStatus;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedUser {
  id: string;
  phone: string | null;
  fullName: string | null;
  status: AccountStatus;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user: AuthenticatedUser;
}
