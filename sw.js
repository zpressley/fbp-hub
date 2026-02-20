/**
 * FBP Hub Service Worker
 * Handles automatic cache invalidation and updates
 */

const CACHE_VERSION = 'fbp-hub-v3.0.20260220';
const CACHE_NAME = `${CACHE_VERSION}`;

// Files to cache
const CORE_CACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/js/auth.js'
];

// Files that should always be fresh (never cached long-term)
const NETWORK_FIRST = [
  '/data/',
  '/config/',
  '/api/'
];

// Install event - cache core files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core files');
      return cache.addAll(CORE_CACHE);
    }).then(() => {
      // Force the waiting service worker to become the active service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Network-first for data/config/API calls
  if (NETWORK_FIRST.some(path => url.pathname.startsWith(path))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the response
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version but update in background
        fetch(event.request).then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {});
        
        return cachedResponse;
      }
      
      // Not in cache, fetch from network
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
