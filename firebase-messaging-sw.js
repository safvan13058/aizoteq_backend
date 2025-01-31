// Import Firebase scripts (Needed for Firebase Cloud Messaging)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');

// Firebase configuration
firebase.initializeApp({
  apiKey: "AIzaSyDU3Hsw-EJ6O6KKwJN-IDddhR_TnErCpFw",
  authDomain: "aizoteq-c0002.firebaseapp.com",
  projectId: "aizoteq-c0002",
  storageBucket: "aizoteq-c0002.appspot.com",
  messagingSenderId: "351655299170",
  appId: "1:351655299170:web:0fcf402a1f8eeeb922293b",
  measurementId: "G-JBFGVX7VXX"
});

// Initialize messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("📩 Background message received:", payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/icon.png" // Optional: Add an icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
