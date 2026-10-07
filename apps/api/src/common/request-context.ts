import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<{ actorId?: string; ipAddress?: string; userAgent?: string }>();
