/*
 * Service Worker ของเว็บแอป (ติดตั้งได้บน PC / Android / iOS)
 *  - หน้าเว็บ (navigation): ดึงจากเน็ตก่อน → ได้เวอร์ชันล่าสุดเสมอ, ออฟไลน์ค่อยใช้ที่เก็บไว้
 *  - ไฟล์อื่นในเว็บเดียวกัน (JS/CSS/ภาพการ์ด): ใช้ที่เก็บไว้ทันที แล้วอัปเดตเบื้องหลัง
 *  - ข้ามเว็บอื่น (Firebase ฯลฯ) ไม่แตะ
 */
const CACHE = 'bs-dual-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? net;
    }),
  );
});
