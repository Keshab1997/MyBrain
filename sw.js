const CACHE_NAME = 'mybrain-store-v1';

// এখানে ফাইলের সঠিক পাথ দেওয়া হলো
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard.html',
  './js/dashboard-core/main.js', // আগে ভুল ছিল
  './css/global.css',
  './css/style-dash.css',
  './css/style-login.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // কোনো একটি ফাইল মিসিং হলে পুরো ক্যাশ ফেইল করে, তাই আমরা try-catch বা individual add ব্যবহার করতে পারি
      // তবে এখানে সঠিক পাথ দেওয়া হয়েছে
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});