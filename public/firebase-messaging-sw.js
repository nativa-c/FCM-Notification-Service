/**
 * Firebase Cloud Messaging service worker.
 *
 * Handles background push messages when the web app is not in focus.
 * Placed at the site root (/) so the service worker has the broadest
 * possible scope for notification interception.
 *
 * Firebase project config values are injected at build time from environment
 * variables; no credentials are hard-coded here.
 */

importScripts('https://www.gstatic.com/firebasejs/9.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.14.0/firebase-messaging-compat.js');

// Values injected by the build pipeline (e.g., envsubst or webpack DefinePlugin)
const firebaseConfig = {
    apiKey:            '__FIREBASE_API_KEY__',
    authDomain:        '__FIREBASE_AUTH_DOMAIN__',
    databaseURL:       '__FIREBASE_DATABASE_URL__',
    projectId:         '__FIREBASE_PROJECT_ID__',
    storageBucket:     '__FIREBASE_STORAGE_BUCKET__',
    messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
    appId:             '__FIREBASE_APP_ID__',
    measurementId:     '__FIREBASE_MEASUREMENT_ID__',
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle data-only messages that arrive when the tab is not active.
// Notification-type messages are rendered by the browser automatically.
messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;  // browser handles notification payloads

    const { title, body, icon, image, click_action } = payload.data || {};

    self.registration
        .showNotification(title, { body, icon, image })
        .then(() => {
            self.addEventListener('notificationclick', (event) => {
                event.notification.close();
                if (click_action) {
                    event.waitUntil(clients.openWindow(click_action));
                }
            });
        });
});
