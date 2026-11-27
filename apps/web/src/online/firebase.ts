/**
 * Transport ผ่าน Firebase Realtime Database + Anonymous Auth
 * ค่าตั้งค่าอ่านจาก apps/web/.env.local (VITE_FIREBASE_*) ดู .env.example
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, goOffline, goOnline, onChildAdded, onDisconnect, onValue, ref, remove, runTransaction, set, type Database } from 'firebase/database';
import { actionKey, decodeAction, encodeAction, type LobbyEntry, type RoomInfo, type Transport } from './transport';

const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** ตั้งค่า Firebase ครบหรือยัง (ต้องมีอย่างน้อย apiKey + databaseURL) */
export const firebaseConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

let app: FirebaseApp | null = null;
let db: Database | null = null;
/** Firebase app ตัวเดียวของแอป (ห้องออนไลน์ + บัญชีผู้ใช้ใช้ร่วมกัน: uid เดียวกัน) */
export function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase (apps/web/.env.local)');
  app ??= initializeApp(firebaseConfig);
  return app;
}
export function database(): Database {
  db ??= getDatabase(firebaseApp());
  return db;
}

/**
 * ต่อ Realtime Database เฉพาะตอนใช้งาน (แผนฟรีของ Firebase รับการเชื่อมต่อพร้อมกันได้ 100)
 *  - งานครั้งเดียว (อ่าน/เขียน: ซิงก์บัญชี, รายการห้อง) = ต่อระหว่างทำ (withDb)
 *  - ตัวฟัง (ห้องดวล / เกมออนไลน์ / ปิง) = ต่อค้างตลอดที่ฟังอยู่ (holdDb)
 *  - ไม่มีใครใช้ต่อเนื่อง DB_IDLE_MS = ตัดการเชื่อมต่อ (goOffline) · ใช้ใหม่ = ต่อกลับเอง (goOnline)
 * ตัดการเชื่อมต่อ = เซิร์ฟเวอร์ทำ onDisconnect ที่ลงไว้ (เอาออกจากรายการห้อง / สมาชิก / ปิง) → ระหว่างอยู่ในห้องต้องมีตัวฟังค้างไว้เสมอ
 */
export const DB_IDLE_MS = 30_000;
let holds = 0;
let dbOnline = true;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
export function holdDb(): () => void {
  const d = database();
  holds++;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!dbOnline) {
    goOnline(d);
    dbOnline = true;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds > 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (holds > 0) return;
      goOffline(d);
      dbOnline = false;
    }, DB_IDLE_MS);
  };
}
/** ทำงานกับฐานข้อมูลครั้งเดียว: ต่อระหว่างทำ แล้วนับเวลาตัดการเชื่อมต่อ */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const release = holdDb();
  try {
    return await fn();
  } finally {
    release();
  }
}
/** สถานะสำหรับทดสอบ / ดีบัก */
export const dbConnection = () => ({ holds, online: dbOnline });

const roomRef = (code: string) => ref(database(), `rooms/${code}`);

function toInfo(v: unknown): RoomInfo | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as {
    seats?: RoomInfo['seats'];
    names?: RoomInfo['names'];
    versions?: RoomInfo['versions'];
    avatars?: RoomInfo['avatars'];
    levels?: RoomInfo['levels'];
    meta?: RoomInfo['meta'];
    setup?: { round: number; seed: number; decks?: { p1?: string; p2?: string }; first?: 'p1' | 'p2'; partnerDecks?: { p1?: string; p2?: string } };
  };
  // Team Battle (2VS2): เด็คของคนที่สองของแต่ละทีม · ต้องส่งต่อ ไม่งั้นทุกเครื่องสร้างเกม 1VS1
  const pd = r.setup?.partnerDecks;
  if (!r.setup || !r.setup.decks?.p1) return null;
  return {
    seats: r.seats ?? {},
    names: r.names ?? {},
    ...(r.versions ? { versions: r.versions } : {}),
    ...(r.avatars ? { avatars: r.avatars } : {}),
    ...(r.levels ? { levels: r.levels } : {}),
    ...(r.meta ? { meta: r.meta } : {}),
    setup: {
      round: r.setup.round,
      seed: r.setup.seed,
      decks: { p1: r.setup.decks.p1, p2: r.setup.decks.p2 ?? null },
      ...(r.setup.first ? { first: r.setup.first } : {}),
      // 1VS2: มีเด็คคนที่สองแค่ฝั่งเดียว
      ...(pd?.p1 || pd?.p2 ? { partnerDecks: { ...(pd.p1 ? { p1: pd.p1 } : {}), ...(pd.p2 ? { p2: pd.p2 } : {}) } } : {}),
    },
  };
}

const rawTransport: Transport = {
  name: 'Firebase',

  async signIn() {
    database();
    const auth = getAuth(app!);
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  },

  async createRoom(code, info) {
    const res = await runTransaction(roomRef(code), (cur) => (cur ? undefined : { ...info, createdAt: Date.now() }));
    if (!res.committed) throw new Error('รหัสห้องนี้ถูกใช้แล้ว ลองใหม่อีกครั้ง');
  },

  async joinRoom(code, uid, deck, name) {
    let reason = '';
    const res = await runTransaction(roomRef(code), (cur) => {
      if (!cur) {
        // ครั้งแรก SDK อาจส่ง null มาก่อนอ่านค่าจริง: คืนค่าเดิมให้ลองใหม่กับข้อมูลจริง
        return cur;
      }
      const seats = cur.seats ?? {};
      if (seats.p2 && seats.p2 !== uid) {
        reason = 'ห้องนี้เต็มแล้ว';
        return undefined;
      }
      if (seats.p1 === uid) {
        reason = 'คุณเป็นเจ้าของห้องนี้อยู่แล้ว';
        return undefined;
      }
      cur.seats = { ...seats, p2: uid };
      cur.names = { ...(cur.names ?? {}), p2: name };
      cur.setup = { ...cur.setup, decks: { ...cur.setup.decks, p2: deck } };
      return cur;
    });
    const info = toInfo(res.snapshot.val());
    if (!info) throw new Error('ไม่พบห้องนี้');
    if (!res.committed || info.seats.p2 !== uid) throw new Error(reason || 'เข้าห้องไม่สำเร็จ');
    return info;
  },

  async readRoom(code) {
    return toInfo((await get(roomRef(code))).val());
  },

  watchRoom(code, cb) {
    return onValue(roomRef(code), (snap) => cb(toInfo(snap.val())));
  },

  async countActions(code, round) {
    const snap = await get(ref(database(), `rooms/${code}/actions/${round}`));
    return snap.exists() ? snap.size : 0;
  },

  watchActions(code, round, cb) {
    return onChildAdded(ref(database(), `rooms/${code}/actions/${round}`), (snap) => {
      cb(Number(snap.key), decodeAction(snap.val() as string));
    });
  },

  async pushAction(code, round, index, action) {
    const res = await runTransaction(ref(database(), `rooms/${code}/actions/${round}/${actionKey(index)}`), (cur) =>
      cur === null ? encodeAction(action) : undefined,
    );
    return res.committed;
  },

  async setFirst(code, round, first) {
    await runTransaction(ref(database(), `rooms/${code}/setup`), (cur) => {
      if (!cur) return cur;
      if (cur.round !== round || cur.first) return undefined;
      return { ...cur, first };
    });
  },

  async setSetup(code, setup) {
    await set(ref(database(), `rooms/${code}/setup`), setup);
  },

  async setVersion(code, seat, version) {
    await set(ref(database(), `rooms/${code}/versions/${seat}`), version);
  },

  async setAvatar(code, seat, avatar) {
    await set(ref(database(), `rooms/${code}/avatars/${seat}`), avatar);
  },

  async setLevel(code, seat, level) {
    await set(ref(database(), `rooms/${code}/levels/${seat}`), level);
  },

  async leave(code, seat) {
    await remove(ref(database(), `rooms/${code}/seats/${seat}`));
  },

  async setHostDeck(code, deck) {
    const res = await runTransaction(roomRef(code), (cur) => {
      if (!cur) return cur;
      if (cur.seats?.p2) return undefined; // คู่แข่งนั่งแล้ว: เกมเริ่มด้วยเด็คเดิม
      cur.setup = { ...cur.setup, decks: { ...cur.setup.decks, p1: deck } };
      return cur;
    });
    return res.committed;
  },

  async listRooms() {
    const snap = await get(ref(database(), 'lobby'));
    const v = (snap.val() ?? {}) as Record<string, Omit<LobbyEntry, 'code'>>;
    return Object.entries(v).map(([code, e]) => ({ ...e, code }));
  },

  async publishRoom(entry) {
    const r = ref(database(), `lobby/${entry.code}`);
    const { code: _code, ...data } = entry;
    await set(r, data);
    // ปิดแท็บ/เน็ตหลุด: เอาออกจากรายการให้เอง
    await onDisconnect(r).remove();
  },

  async unpublishRoom(code) {
    await remove(ref(database(), `lobby/${code}`));
  },

  watchPath(path, cb) {
    return onValue(ref(database(), path), (snap) => cb(snap.val()));
  },
  async readPath(path) {
    return (await get(ref(database(), path))).val();
  },
  async setPath(path, value) {
    await set(ref(database(), path), value);
  },
  async removePath(path) {
    await remove(ref(database(), path));
  },
  async transactPath(path, fn) {
    const res = await runTransaction(ref(database(), path), (cur) => fn(cur));
    return { committed: res.committed, value: res.snapshot.val() };
  },
  async removeOnDisconnect(path) {
    await onDisconnect(ref(database(), path)).remove();
  },
  watchConnected(cb) {
    // ตอนเปิดแอปค่าแรกเป็น false ชั่วครู่ก่อนต่อติด: รายงาน false เฉพาะหลังจากเคยต่อติดแล้ว
    let was = false;
    return onValue(ref(database(), '.info/connected'), (snap) => {
      const c = snap.val() === true;
      if (c) was = true;
      if (c || was) cb(c);
    });
  },
};

/** ตัวฟังที่ต้องต่อค้างไว้ตลอด (คืนฟังก์ชันเลิกฟัง) · ที่เหลือ = งานครั้งเดียว */
const WATCHERS = new Set<keyof Transport>(['watchRoom', 'watchActions', 'watchPath', 'watchConnected']);
export const firebaseTransport: Transport = Object.fromEntries(
  Object.entries(rawTransport).map(([k, v]) => {
    if (typeof v !== 'function' || k === 'signIn') return [k, v];
    const fn = v as (...a: unknown[]) => unknown;
    if (WATCHERS.has(k as keyof Transport)) {
      return [
        k,
        (...a: unknown[]) => {
          const release = holdDb();
          const unsub = fn(...a) as () => void;
          return () => {
            unsub();
            release();
          };
        },
      ];
    }
    return [k, (...a: unknown[]) => withDb(() => fn(...a) as Promise<unknown>)];
  }),
) as unknown as Transport;
