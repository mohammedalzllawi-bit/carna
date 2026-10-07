import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, getApp, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { existsSync } from 'node:fs';

@Injectable()
export class FirebasePushService {
  private readonly logger = new Logger(FirebasePushService.name);
  private readonly messaging: Messaging | null;
  private readonly projectId: string | null;
  private readonly reason: string | null;

  constructor(config: ConfigService) {
    this.projectId = config.get<string>('FIREBASE_PROJECT_ID') || null;
    const credentials = config.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
    if (!this.projectId) {
      this.reason = 'project_id_missing';
      this.messaging = null;
      return;
    }
    if (credentials && !existsSync(credentials)) {
      this.reason = 'credentials_file_missing';
      this.messaging = null;
      return;
    }
    if (!credentials && !process.env.K_SERVICE && !process.env.GOOGLE_CLOUD_PROJECT) {
      this.reason = 'credentials_missing';
      this.messaging = null;
      return;
    }
    try {
      let app;
      try { app = getApp('carna-push'); }
      catch { app = initializeApp({ credential: applicationDefault(), projectId: this.projectId }, 'carna-push'); }
      this.messaging = getMessaging(app);
      this.reason = null;
    } catch (error) {
      this.logger.error(`Firebase initialization failed: ${(error as Error).message}`);
      this.messaging = null;
      this.reason = 'initialization_failed';
    }
  }

  status() {
    return { configured: this.messaging !== null, projectId: this.projectId, reason: this.reason };
  }

  async send(token: string, title: string, body: string, data: Record<string, string>) {
    if (!this.messaging) throw new ServiceUnavailableException('notifications.push_not_configured');
    return this.messaging.send({ token, notification: { title, body }, data,
      android: { priority: 'high', notification: { channelId: 'carna_updates' } } });
  }
}
