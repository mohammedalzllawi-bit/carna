import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { requestContext } from './common/request-context';
import { AuctionRealtimeGateway } from './modules/auctions/auction-realtime.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), { rawBody: true });
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  app.use((request: { ip?: string; headers: Record<string, string> }, _response: unknown, next: () => void) => {
    requestContext.run({ ipAddress: request.ip, userAgent: request.headers['user-agent'] }, next);
  });

  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS')?.split(',') ?? true,
    credentials: true,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Libya Car Auctions API')
    .setDescription('API-first backend for Libyan car auctions marketplace')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  await app.init();
  if (!app.get(AuctionRealtimeGateway).server) {
    await app.close();
    throw new Error('Auction WebSocket gateway failed to initialize');
  }
  await app.listen(config.get<number>('PORT') ?? 4100);
}

void bootstrap();
