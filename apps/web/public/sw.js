/*
 * Service Worker ของเว็บแอป (ติดตั้งได้บน PC / Android / iOS)
 *  - หน้าเว็บ (navigation): ดึงจากเน็ตก่อน → ได้เวอร์ชันล่าสุดเสมอ, ออฟไลน์ค่อยใช้ที่เก็บไว้
 *  - assets/ (ชื่อไฟล์มีแฮช = เนื้อหาไม่เปลี่ยน): ใช้ที่เก็บไว้เลยไม่ถามเน็ตซ้ำ · ไม่มีค่อยโหลดแล้วเก็บ
 *    ไฟล์ชุดนี้คือที่ "ดาวน์โหลดข้อมูลเกมทั้งหมด" (src/gameData.ts) โหลดเก็บไว้ล่วงหน้า
 *  - ไฟล์อื่นในเว็บเดียวกัน: ใช้ที่เก็บไว้ทันที แล้วอัปเดตเบื้องหลัง
 *  - ข้ามเว็บอื่น (Firebase ฯลฯ) ไม่แตะ
 * ชื่อ CACHE ต้องตรงกับ src/gameData.ts (ห้ามเปลี่ยน ไม่งั้นข้อมูลที่ผู้เล่นดาวน์โหลดไว้ถูกลบทิ้ง)
 */
const CACHE = 'bs-dual-v2';

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

/** ตอบคำขอแบบช่วง (Range: เพลงใน <audio>) จากไฟล์เต็มที่เก็บไว้ → 206 */
async function rangeFromCache(req, hit) {
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const size = buf.byteLength;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2])); // bytes=-N = N ไบต์สุดท้าย
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(hit.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // เลขเวอร์ชัน / รายชื่อไฟล์บนเว็บ: ต้องถามเน็ตทุกครั้ง (ห้ามใช้ที่เก็บไว้ ไม่งั้นไม่รู้ว่ามีเวอร์ชันใหม่)
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/asset-manifest.json')) return;
  const asset = url.pathname.includes('/assets/');

  // คำขอแบบช่วง (เพลง/เสียง → 206): Cache API เก็บไม่ได้ · ถ้ามีไฟล์เต็มที่ดาวน์โหลดไว้ ตัดช่วงให้เอง (เล่นออฟไลน์ได้)
  if (req.headers.has('range')) {
    if (!asset) return;
    event.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match(url.href))
        .then((hit) => (hit ? rangeFromCache(req, hit) : fetch(req))),
    );
    return;
  }

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

  if (asset) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.status === 200) cache.put(req, res.clone());
        return res;
      }),
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
