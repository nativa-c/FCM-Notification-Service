// NestJS FCM Push Notification Service
// Provides REST API for sending Firebase Cloud Messaging (FCM) notifications
// Supports both individual device tokens and topic-based broadcasts

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
