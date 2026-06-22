import { Controller, Post, Body, Logger } from '@nestjs/common';
import { MessageDto } from './message.dto';
import * as admin from 'firebase-admin';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor() {
    // Firebase Admin SDK — credentials injected via Workload Identity / service account env
    if (!admin.apps.length) {
      admin.initializeApp();
    }
  }

  /**
   * POST /send
   * Send an FCM push notification to a single device token.
   * Token and server key are resolved from environment; hard-coded values
   * must never appear in source code.
   */
  @Post('send')
  async sendMessage(@Body() messageDto: MessageDto): Promise<string> {
    this.logger.log(`Sending FCM: title="${messageDto.title}"`);

    const deviceToken = process.env.FCM_DEVICE_TOKEN;
    if (!deviceToken) {
      throw new Error('FCM_DEVICE_TOKEN environment variable is not set');
    }

    const message: admin.messaging.Message = {
      notification: {
        title: messageDto.title,
        body:  messageDto.body,
      },
      token: deviceToken,
    };

    try {
      const response = await admin.messaging().send(message);
      this.logger.log(`FCM send success: messageId=${response}`);

      await this.saveMessageToFirestore(messageDto);
      return 'Message sent successfully';
    } catch (err) {
      this.logger.error('FCM send failed', err);
      throw err;
    }
  }

  /**
   * POST /send-topic
   * Broadcast to all subscribers of a named topic.
   */
  @Post('send-topic')
  async sendToTopic(@Body() messageDto: MessageDto & { topic: string }): Promise<string> {
    this.logger.log(`Sending to topic "${messageDto.topic}"`);

    const message: admin.messaging.Message = {
      notification: { title: messageDto.title, body: messageDto.body },
      topic: messageDto.topic,
    };

    const response = await admin.messaging().send(message);
    this.logger.log(`Topic send success: messageId=${response}`);
    return 'Topic message sent';
  }

  private async saveMessageToFirestore(messageDto: MessageDto): Promise<void> {
    const firestore = admin.firestore();
    await firestore.collection('fcmMessages').add({
      title:     messageDto.title,
      body:      messageDto.body,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}
