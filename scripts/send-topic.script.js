/**
 * CLI helper: broadcast FCM message to a topic
 *
 * Usage:
 *   FCM_TOPIC=news \
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   node send-topic.script.js "Breaking News" "Something important happened"
 *
 * The script uses firebase-admin directly so it can be run outside the
 * NestJS server for ops / testing purposes.
 */
const admin = require('firebase-admin');

const topic = process.env.FCM_TOPIC || 'general';
const [, , title = 'Test', body = 'Hello from topic script'] = process.argv;

if (!admin.apps.length) {
  admin.initializeApp();
}

const message = {
  notification: { title, body },
  topic,
};

admin
  .messaging()
  .send(message)
  .then((response) => {
    console.log('✅ Topic message sent:', response);
  })
  .catch((error) => {
    console.error('❌ Failed to send topic message:', error);
    process.exit(1);
  });
