/**
 * Transport จำลองสำหรับทดสอบ: เก็บข้อมูลใน localStorage และแจ้งแท็บอื่นด้วย BroadcastChannel
 * เปิดเกม 2 แท็บในเบราว์เซอร์เดียวกันด้วย ?online=local เพื่อทดสอบเล่นออนไลน์โดยไม่ต้องใช้ Firebase
 */
import { actionKey, decodeAction, encodeAction, type RoomInfo, type Transport } from './transport';

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
      const sig = JSON.stringify(r && { seats: r.seats, setup: r.setup, names: r.names, versions: r.versions });
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
};
