// sw.js - Version Update: v7
const CACHE_NAME = 'mindvault-v7'; 
const ASSETS = [
  './', 
  './index.html', 
  './dashboard.html', 
  './vault.html', 
  './css/global.css', 
  './css/layout.css',
  './css/style-dash.css',
  './css/dark-mode.css',
  './js/ui-shared.js'
];

// ইনস্টল হওয়ার সময় নতুন ফাইল ক্যাশ করা
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting(); // নতুন ভার্সন আসার সাথে সাথে ওয়েটিং পিরিয়ড স্কিপ করবে
});

// অ্যাক্টিভেট হওয়ার সময় পুরনো ক্যাশ ডিলিট করা
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        // বর্তমান ভার্সন ছাড়া বাকি সব পুরনো ক্যাশ মুছে ফেলবে
        if (key !== CACHE_NAME && key !== 'mindvault-images' && key !== 'shared-data' && key !== 'shared-queue') {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim(); // সাথে সাথে সব ট্যাব কন্ট্রোল নিয়ে নেবে
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ক্লাউডিনারি ইমেজ ক্যাশ করার লজিক
  if (url.hostname.includes('cloudinary.com')) {
    event.respondWith(
      caches.open('mindvault-images').then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // শেয়ার টারগেট হ্যান্ডেল করা (Background Processing)
  if (event.request.method === 'POST' && event.request.url.includes('dashboard.html')) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const urlStr = formData.get('url') || '';
        const files = formData.getAll('shared_image');

        // ডেটাগুলো একটি টেম্পোরারি ক্যাশে সেভ করা
        const cache = await caches.open('shared-queue');
        await cache.put('pending-share', new Response(JSON.stringify({
          title, text, url: urlStr, timestamp: Date.now()
        })));
        
        if (files.length > 0) {
          for(let i=0; i<files.length; i++) {
            await cache.put(`pending-file-${i}`, new Response(files[i]));
          }
        }

        // ড্যাশবোর্ডে রিডাইরেক্ট করা
        return Response.redirect('./dashboard.html?process_share=true', 303);
      })()
    );
    return;
  }
  
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('firebasejs')) {
    return;
  }

  // নেটওয়ার্ক ফার্সট স্ট্র্যাটেজি (যাতে আপডেট দ্রুত পাওয়া যায়)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
