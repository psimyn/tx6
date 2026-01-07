const CACHE_NAME = 'tx6-cache-1767755713';

self.addEventListener('install', event => {
  // Don't skipWaiting() - let the main app control when to activate
  // This allows showing "update available" notification
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
  // Take control of all clients immediately after activation
  self.clients.claim();
});

// Listen for skipWaiting message from main app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignore cross-origin requests (like Cloudflare Analytics)
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first for HTML, CSS, and JS assets
  if (url.pathname === '/' || url.pathname.endsWith('.html') ||
    url.pathname.match(/\.(css|js)$/)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Only cache successful responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first for other assets (images, manifest, etc.)
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
