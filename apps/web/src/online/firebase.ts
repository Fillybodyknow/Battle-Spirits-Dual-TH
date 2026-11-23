/**
 * Transport ผ่าน Firebase Realtime Database + Anonymous Auth
 * ค่าตั้งค่าอ่านจาก apps/web/.env.local (VITE_FIREBASE_*) ดู .env.example
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, onChildAdded, onDisconnect, onValue, ref, remove, runTransaction, set, type Database } from 'firebase/database';
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
      ...(pd?.p1 && pd?.p2 ? { partnerDecks: { p1: pd.p1, p2: pd.p2 } } : {}),
    },
  };
}

export const firebaseTransport: Transport = {
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
};
