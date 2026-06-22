/**
 * CLI script: send a data-only FCM push to a single device token.
 *
 * Uses firebase-admin with Application Default Credentials (ADC) so no
 * service-account file path is hard-coded.  The target token is supplied via
 * the FCM_DEVICE_TOKEN environment variable.
 *
 * Usage:
 *   FCM_DEVICE_TOKEN=<token> node send-token.script.js
 */
const admin = require('firebase-admin');

// ADC: GOOGLE_APPLICATION_CREDENTIALS env var or Workload Identity on GKE/CR
admin.initializeApp({ credential: admin.credential.applicationDefault() });

const messaging = admin.messaging();

const message = {
    notification: {
        title:    'Test Notification',
        body:     'Test push message body',
        imageUrl: process.env.FCM_NOTIFICATION_IMAGE_URL || '',
    },
    android: {
        notification: {
            sound:       'default',
            clickAction: 'OPEN_ACTIVITY_1',
        },
    },
    apns: {
        payload: {
            aps: { badge: 1, sound: 'default' },
        },
    },
    data: {
        tapActionType:  'OPEN_ACTIVITY_1',
        tapActionValue: 'DetailPage',
    },
    token: process.env.FCM_DEVICE_TOKEN,
};

messaging
    .send(message)
    .then((response) => console.log('Message sent successfully:', response))
    .catch((error)   => console.error('Error sending message:', error));
