/* 玉桂狗专注台 Service Worker
 * - 页面(HTML)：网络优先，断网时用缓存，保证能在手机桌面离线打开
 * - 本站静态资源（图标等）：先用缓存、后台更新
 * - Firebase 脚本(gstatic)：缓存后可离线启动
 * - Firestore 等其它跨域请求：不拦截，直接走网络
 */
const CACHE = 'cinnamoroll-v13';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (old.length) {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach((c) => c.postMessage({ type: 'sw-updated' }));
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) 页面导航：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          const c = await caches.open(CACHE);
          c.put('./index.html', net.clone());
        }
        return net;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 2) 本站静态资源：先缓存，后台更新
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf('/api/') !== -1) return;
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      const fetching = fetch(req).then((net) => { if (net && net.ok) c.put(req, net.clone()); return net; }).catch(() => null);
      return hit || (await fetching) || Response.error();
    })());
    return;
  }

  // 3) Firebase 脚本：缓存优先
  if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        if (net && (net.ok || net.type === 'opaque')) c.put(req, net.clone());
        return net;
      } catch (err) { return Response.error(); }
    })());
  }
  // 其它跨域请求（Firestore、图片、视频等）不拦截
});
