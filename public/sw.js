// Offline support: keeps the app shell (page, scripts, styles, icons) on the device so
// Route Rabbit opens with no signal. Patient data already lives in localStorage; this
// only caches the app itself. Map tiles, weather, and address lookups still need a
// connection and are never touched here.

const CACHE = 'route-rabbit-shell-v1'
const SCOPE = self.registration.scope
const INDEX_URL = SCOPE

/** Same-origin build assets referenced by a copy of index.html. */
function assetUrlsIn(html) {
  const urls = new Set()
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], SCOPE)
    if (url.origin === self.location.origin && url.href.startsWith(SCOPE)) urls.add(url.href)
  }
  return [...urls]
}

/** Caches a fresh index.html plus everything it loads, and drops assets from older builds. */
async function refreshShell(cache, indexResponse) {
  const html = await indexResponse.clone().text()
  const assets = assetUrlsIn(html)
  await cache.put(INDEX_URL, indexResponse)
  await Promise.all(
    assets.map((url) =>
      cache.match(url, { ignoreVary: true }).then((hit) => hit ?? fetch(url).then((res) => (res.ok ? cache.put(url, res) : undefined))),
    ),
  )
  const keep = new Set([INDEX_URL, ...assets])
  for (const request of await cache.keys()) {
    if (request.url.includes('/assets/') && !keep.has(request.url)) await cache.delete(request)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const res = await fetch(INDEX_URL, { cache: 'no-store' })
      if (res.ok) await refreshShell(cache, res)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE) || url.pathname.includes('/api/')) return

  // Pages: network first so a new deploy shows up right away; the cached copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const res = await fetch(request, { cache: 'no-store' })
          if (res.ok) event.waitUntil(refreshShell(cache, res.clone()))
          return res
        } catch {
          return (await cache.match(INDEX_URL)) ?? Response.error()
        }
      })(),
    )
    return
  }

  // Everything else in scope (hashed bundles, icons, manifest): cache first, fill on miss.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      // ignoreVary: module scripts are requested with an Origin header the install-time fetch lacked.
      const hit = await cache.match(request, { ignoreVary: true })
      if (hit) return hit
      const res = await fetch(request)
      if (res.ok) event.waitUntil(cache.put(request, res.clone()))
      return res
    })(),
  )
})
