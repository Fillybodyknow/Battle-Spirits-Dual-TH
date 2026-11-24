/**
 * Transport จำลองสำหรับทดสอบ: เก็บข้อมูลใน localStorage และแจ้งแท็บอื่นด้วย BroadcastChannel
 * เปิดเกม 2 แท็บในเบราว์เซอร์เดียวกันด้วย ?online=local เพื่อทดสอบเล่นออนไลน์โดยไม่ต้องใช้ Firebase
 */
import { actionKey, decodeAction, encodeAction, type LobbyEntry, type RoomInfo, type Transport } from './transport';

const LOBBY = 'bs-local-lobby';

/** ?lag=<ms> = จำลองเน็ตช้า (หน่วงการส่ง action / เขียนข้อมูลของแท็บนี้) ใช้ทดสอบป้ายปิง */
const LAG = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('lag')) || 0 : 0;
const lag = () => (LAG ? new Promise<void>((r) => setTimeout(r, LAG)) : Promise.resolve());

/** ข้อมูลแบบต้นไม้ (ห้องดวล) เก็บแยกคีย์ ใช้ path แบบ Firebase */
const TREE = 'bs-local-tree';
const readTree = (): Record<string, unknown> => {
  try {
    return JSON.parse(localStorage.getItem(TREE) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};
const parts = (path: string) => path.split('/').filter(Boolean);
function getAt(tree: unknown, path: string): unknown {
  let cur = tree;
  for (const k of parts(path)) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur ?? null;
}
/** ตัด object ว่างทิ้ง (เหมือน Firebase) */
function prune(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const p = prune(x);
    if (p !== null && p !== undefined) out[k] = p;
  }
  return Object.keys(out).length ? out : null;
}
function setAt(path: string, value: unknown) {
  const tree = readTree();
  const ks = parts(path);
  let cur: Record<string, unknown> = tree;
  for (const k of ks.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[ks.at(-1)!] = value === undefined ? null : JSON.parse(JSON.stringify(value));
  localStorage.setItem(TREE, JSON.stringify(prune(tree) ?? {}));
  channel?.postMessage('changed');
  queueMicrotask(() => listeners.forEach((l) => l()));
}
const readLobby = (): Record<string, LobbyEntry> => {
  try {
    return JSON.parse(localStorage.getItem(LOBBY) ?? '{}') as Record<string, LobbyEntry>;
  } catch {
    return {};
  }
};

const KEY = 'bs-local-online';
type Store = Record<string, RoomInfo & { actions?: Record<string, Record<string, string>> }>;

const read = (): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
};
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(KEY) : null;
const listeners = new Set<() => void>();
const write = (s: Store) => {
  localStorage.setItem(KEY, JSON.stringify(s));
  channel?.postMessage('changed');
  // แท็บนี้ก็ต้องรู้ด้วย (BroadcastChannel ไม่ส่งกลับหาตัวเอง)
  queueMicrotask(() => listeners.forEach((l) => l()));
};
channel?.addEventListener('message', () => listeners.forEach((l) => l()));
// ข้อความจาก BroadcastChannel อาจมาถึงก่อนค่าใน localStorage ของแท็บนี้จะอัปเดต: ฟัง storage event ด้วย (มาหลังค่าเปลี่ยนแล้ว)
if (typeof window !== 'undefined') window.addEventListener('storage', () => listeners.forEach((l) => l()));
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** uid ต่อแท็บ (sessionStorage แยกกันต่อแท็บ) */
function tabUid(): string {
  let id = sessionStorage.getItem('bs-local-uid');
  if (!id) {
    id = 'tab-' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('bs-local-uid', id);
  }
  return id;
}

export const localTransport: Transport = {
  name: 'ทดสอบในเครื่อง',
  async signIn() {
    return tabUid();
  },
  async createRoom(code, info) {
    const s = read();
    if (s[code]) throw new Error('รหัสห้องนี้ถูกใช้แล้ว');
    s[code] = info;
    write(s);
  },
  async joinRoom(code, uid, deck, name) {
    const s = read();
    const room = s[code];
    if (!room) throw new Error('ไม่พบห้องนี้');
    if (room.seats.p1 === uid) throw new Error('คุณเป็นเจ้าของห้องนี้อยู่แล้ว');
    if (room.seats.p2 && room.seats.p2 !== uid) throw new Error('ห้องนี้เต็มแล้ว');
    room.seats.p2 = uid;
    room.names = { ...(room.names ?? {}), p2: name };
    room.setup.decks.p2 = deck;
    write(s);
    return room;
  },
  async readRoom(code) {
    return read()[code] ?? null;
  },
  watchRoom(code, cb) {
    let last = '';
    const check = () => {
      const r = read()[code] ?? null;
      const sig = JSON.stringify(r && { seats: r.seats, setup: r.setup, names: r.names, versions: r.versions, avatars: r.avatars, levels: r.levels, meta: r.meta });
      if (sig === last) return;
      last = sig;
      cb(r);
    };
    queueMicrotask(check);
    return subscribe(check);
  },
  async countActions(code, round) {
    return Object.keys(read()[code]?.actions?.[round] ?? {}).length;
  },
  watchActions(code, round, cb) {
    let seen = 0;
    const check = () => {
      const list = read()[code]?.actions?.[round] ?? {};
      while (list[actionKey(seen)] !== undefined) {
        cb(seen, decodeAction(list[actionKey(seen)]!));
        seen++;
      }
    };
    queueMicrotask(check);
    return subscribe(check);
  },
  async pushAction(code, round, index, action) {
    await lag();
    const s = read();
    const room = s[code];
    if (!room) return false;
    const list = ((room.actions ??= {})[round] ??= {});
    if (list[actionKey(index)] !== undefined) return false;
    list[actionKey(index)] = encodeAction(action);
    write(s);
    return true;
  },
  async setVersion(code, seat, version) {
    const s = read();
    const room = s[code];
    if (!room) return;
    room.versions = { ...(room.versions ?? {}), [seat]: version };
    write(s);
  },
  async setAvatar(code, seat, avatar) {
    const s = read();
    const room = s[code];
    if (!room) return;
    room.avatars = { ...(room.avatars ?? {}), [seat]: avatar };
    write(s);
  },
  async setLevel(code, seat, level) {
    const s = read();
    const room = s[code];
    if (!room) return;
    room.levels = { ...(room.levels ?? {}), [seat]: level };
    write(s);
  },
  async setFirst(code, round, first) {
    const s = read();
    const room = s[code];
    if (!room || room.setup.round !== round || room.setup.first) return;
    room.setup.first = first;
    write(s);
  },
  async setSetup(code, setup) {
    const s = read();
    if (!s[code]) return;
    s[code]!.setup = setup;
    write(s);
  },
  async leave(code, seat) {
    const s = read();
    if (!s[code]) return;
    delete s[code]!.seats[seat];
    write(s);
  },
  async setHostDeck(code, deck) {
    const s = read();
    const room = s[code];
    if (!room || room.seats.p2) return false;
    room.setup.decks.p1 = deck;
    write(s);
    return true;
  },
  async listRooms() {
    return Object.values(readLobby());
  },
  async publishRoom(entry) {
    localStorage.setItem(LOBBY, JSON.stringify({ ...readLobby(), [entry.code]: entry }));
  },
  async unpublishRoom(code) {
    const l = readLobby();
    delete l[code];
    localStorage.setItem(LOBBY, JSON.stringify(l));
  },
  watchPath(path, cb) {
    let last = '\u0000';
    const check = () => {
      const v = getAt(readTree(), path);
      const sig = JSON.stringify(v);
      if (sig === last) return;
      last = sig;
      cb(v === null ? null : JSON.parse(sig));
    };
    queueMicrotask(check);
    return subscribe(check);
  },
  async readPath(path) {
    return getAt(readTree(), path);
  },
  async setPath(path, value) {
    await lag();
    setAt(path, value);
  },
  async removePath(path) {
    setAt(path, null);
  },
  async transactPath(path, fn) {
    const cur = getAt(readTree(), path);
    const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
    if (next === undefined) return { committed: false, value: cur };
    setAt(path, next);
    return { committed: true, value: getAt(readTree(), path) };
  },
  async removeOnDisconnect() {
    /* ทดสอบในเครื่อง: ไม่มีการหลุด */
  },
};
