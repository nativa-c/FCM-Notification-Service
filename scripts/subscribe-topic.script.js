/**
 * CLI scripts for FCM topic subscription management.
 *
 * subscribeTokensToTopic  — register device tokens to a topic
 * unsubscribeTokensFromTopic — deregister device tokens from a topic
 *
 * Tokens are read from the FCM_DEVICE_TOKENS env var (comma-separated).
 * Topic is read from FCM_TOPIC.
 *
 * Usage:
 *   FCM_TOPIC=news FCM_DEVICE_TOKENS=tok1,tok2 node subscribe-topic.script.js subscribe
 *   FCM_TOPIC=news FCM_DEVICE_TOKENS=tok1,tok2 node subscribe-topic.script.js unsubscribe
 */
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault() });

const messaging = admin.messaging();

const topic  = process.env.FCM_TOPIC;
const tokens = (process.env.FCM_DEVICE_TOKENS || '').split(',').filter(Boolean);
const action = process.argv[2] || 'subscribe';

if (!topic)           throw new Error('FCM_TOPIC env var is required');
if (tokens.length === 0) throw new Error('FCM_DEVICE_TOKENS env var is required');

const run = () => {
    if (action === 'subscribe') {
        return messaging
            .subscribeToTopic(tokens, topic)
            .then((res) => console.log(`Subscribed ${tokens.length} token(s) to "${topic}":`, res))
            .catch((err) => console.error('Subscribe error:', err));
    }
    if (action === 'unsubscribe') {
        return messaging
            .unsubscribeFromTopic(tokens, topic)
            .then((res) => console.log(`Unsubscribed ${tokens.length} token(s) from "${topic}":`, res))
            .catch((err) => console.error('Unsubscribe error:', err));
    }
    console.error(`Unknown action "${action}". Use "subscribe" or "unsubscribe".`);
    process.exit(1);
};

run();
