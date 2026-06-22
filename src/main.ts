import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const app    = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable global request body validation via class-validator decorators in DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // CORS — restrict to known origins in production via FCM_ALLOWED_ORIGINS env var
  const allowedOrigins = (process.env.FCM_ALLOWED_ORIGINS ?? '*').split(',');
  app.enableCors({ origin: allowedOrigins });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  logger.log(`FCM notification service listening on port ${port}`);
}

bootstrap();
