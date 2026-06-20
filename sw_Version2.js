// sw.js - umieść w katalogu root serwisu: https://twojadomena.pl/sw.js
const CACHE_NAME = 'skrypt-maxa-v2';
const PRECACHE = [
  '/', // jeśli publikujesz jako plik w root, root path będzie przekierowywać
  '/gemini-code-1781978097703_Version4.html',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Roboto+Mono:wght@400;500;700&family=Rubik:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(err => console.error('Precache failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // obrazy - cache-first z fallback SVG
  if (req.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|webp)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(networkResp => {
          if (!networkResp || networkResp.status !== 200) return networkResp;
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone).catch(()=>{}));
          return networkResp;
        }).catch(() => {
          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
              <rect width="400" height="240" fill="#f3f4f6"/>
              <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="16">Brak połączenia — obraz niedostępny</text>
            </svg>`;
          return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' }});
        });
      })
    );
    return;
  }

  // HTML / navigacja - network-first z fallback cache
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then(resp => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, respClone).catch(()=>{}));
        return resp;
      }).catch(() => caches.match(req).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // inne zasoby - stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(networkResp => {
        if (networkResp && networkResp.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, networkResp.clone()).catch(()=>{}));
        }
        return networkResp;
      }).catch(()=>null);
      return cached || networkFetch;
    })
  );
});