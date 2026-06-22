import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface SendResult {
  messageId: string;
  success:   boolean;
  error?:    string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  /**
   * Send a multicast FCM message to multiple device tokens.
   * Batch size is limited to 500 tokens per FCM API constraint.
   */
  async sendMulticast(tokens: string[], title: string, body: string): Promise<SendResult[]> {
    if (tokens.length === 0) return [];

    const message: admin.messaging.MulticastMessage = {
      notification: { title, body },
      tokens,
    };

    const batchResponse = await admin.messaging().sendEachForMulticast(message);
    this.logger.log(`Multicast: ${batchResponse.successCount} ok / ${batchResponse.failureCount} failed`);

    return batchResponse.responses.map((r, i) => ({
      messageId: r.messageId ?? tokens[i],
      success:   r.success,
      error:     r.error?.message,
    }));
  }

  /**
   * Subscribe a list of tokens to an FCM topic.
   */
  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    const resp = await admin.messaging().subscribeToTopic(tokens, topic);
    this.logger.log(`Topic subscribe: topic=${topic}, success=${resp.successCount}, fail=${resp.failureCount}`);
  }

  /**
   * Unsubscribe tokens from an FCM topic.
   */
  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    const resp = await admin.messaging().unsubscribeFromTopic(tokens, topic);
    this.logger.log(`Topic unsubscribe: topic=${topic}, success=${resp.successCount}, fail=${resp.failureCount}`);
  }
}
