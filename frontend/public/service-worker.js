// Grocer-E Service Worker
// Provides offline caching and improved performance

const CACHE_NAME = 'grocer-e-v1';
const API_CACHE_NAME = 'grocer-e-api-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE).catch(() => {
          // Non-fatal if some assets aren't cached
          console.warn('[Service Worker] Some assets could not be cached');
        });
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // For API requests - network first, fall back to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if offline
          return caches.match(request)
            .then((response) => {
              if (response) {
                console.log('[Service Worker] Serving cached API response for:', request.url);
                return response;
              }
              // Return offline error response
              return new Response(
                JSON.stringify({
                  error: 'Offline - data may be stale',
                  cached: true,
                }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            });
        })
    );
    return;
  }

  // For app assets - cache first, fall back to network
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(request)
          .then((response) => {
            // Cache successful asset responses
            if (response.ok && (
              request.method === 'GET' &&
              (url.pathname.endsWith('.js') ||
                url.pathname.endsWith('.css') ||
                url.pathname.endsWith('.json') ||
                url.pathname.endsWith('.png') ||
                url.pathname.endsWith('.jpg') ||
                url.pathname.endsWith('.jpeg') ||
                url.pathname.endsWith('.svg') ||
                url.pathname.endsWith('.woff') ||
                url.pathname.endsWith('.woff2'))
            )) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseClone);
                });
            }
            return response;
          });
      })
      .catch(() => {
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});

// Handle messages from the page (e.g., skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
