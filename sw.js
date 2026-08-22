// Service Worker for eLudo PWA
const CACHE_NAME = 'eludo-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/controller.html',
    '/style.css',
    '/controller.css',
    '/js/audio.js',
    '/js/board.js',
    '/js/remote.js',
    '/js/game.js',
    '/js/main.js',
    '/js/controller.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('Cache addAll:', err));
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
