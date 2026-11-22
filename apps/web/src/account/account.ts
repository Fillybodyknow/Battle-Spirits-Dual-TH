/**
 * บัญชีผู้ใช้ (ระยะ 1): ล็อกอิน Google / Email แล้วซิงก์ชื่อ รูปโปรไฟล์ เด็คที่จัดไว้ และการตั้งค่า ข้ามเครื่อง
 * - เก็บในเครื่องก่อนเสมอ (ออฟไลน์ก็เล่นได้) แล้วค่อยส่งขึ้นคลาวด์อัตโนมัติ: เช็กการเปลี่ยนแปลงทุก 2.5 วินาที
 * - ซิงก์เต็ม (ดึง + รวม + ส่ง: merge.ts แก้ล่าสุดชนะ) ตอนล็อกอิน / เปิดแอป / กลับมาที่แท็บ
 * - ปุ่ม "ซิงก์ตอนนี้" มีเฉพาะในหน้าบัญชีที่เปิดจากหน้าไตเติล (เจ้าของโปรเจกต์กำหนด)
 * - ออกจากระบบ = ข้อมูลในเครื่องยังอยู่ แค่หยุดซิงก์
 */
import { create } from 'zustand';
import { firebaseConfigured } from '../online/firebase';
import { decodeDeck, encodeDeck, loadMyDecks, replaceMyDecks, type SavedDeck } from '../decks';
import { setPrefs, type Prefs } from '../prefs';
import { setSfx } from '../sfx';
import { setBgmSettings } from '../bgm';
import { reloadGfx } from '../gfx';
import { reloadTutorialProgress } from '../tutorial/tutorial';
import { reloadSoloProgress } from '../solo/progress';
import { mergeExpJson, reloadLevel } from '../progression/level';
import { useGame, type CutInMode } from '../store';
import { AccountError, type CloudBackend, type CloudProfile, type CloudUser } from './cloud';
import { firebaseCloud } from './firebaseCloud';
import { localCloud } from './localCloud';
import { mergeDecks, mergeSettings, settingsHash, type SettingsState, type SyncDeck } from './merge';

const useLocal = typeof location !== 'undefined' && new URLSearchParams(location.search).get('online') === 'local';
/** ?online=local หรือยังไม่ได้ตั้งค่า Firebase = บัญชีจำลองในเครื่อง */
export const cloud: CloudBackend = useLocal || !firebaseConfigured ? localCloud : firebaseCloud;

/** การตั้งค่าที่ซิงก์ (คีย์ localStorage เก็บค่าดิบ) · ไม่ซิงก์: เกมที่ค้าง, เวอร์ชันที่ดูแล้ว, ผลวัดความเร็วเครื่อง */
const SETTING_KEYS = ['bs-play-prefs', 'bs-sfx', 'bs-bgm', 'bs-gfx', 'bs-cutin', 'bs-lobby-deck', 'bs-deck-acc', 'bs-tutorial', 'bs-solo', 'bs-exp'] as const;
const AVATAR_KEY = 'bs-avatar';
const STATE_KEY = 'bs-sync';
const PUSH_MS = 2500;

// ---------------------------------------------------------------- ในเครื่อง

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ไม่มี storage: ใช้แค่รอบนี้ */
    }
  },
};

/** สถานะการซิงก์ของเครื่องนี้ (บัญชีที่ซิงก์ล่าสุด + สิ่งที่ซิงก์ไปแล้ว) */
interface SyncState {
  uid: string;
  known: Record<string, number>;
  settings: SettingsState | null;
  profile: string;
  profileUpdated: number;
}
function readState(): SyncState | null {
  try {
    const s = JSON.parse(store.get(STATE_KEY) ?? 'null') as SyncState | null;
    return s && typeof s.uid === 'string' ? s : null;
  } catch {
    return null;
  }
}
const writeState = (s: SyncState) => store.set(STATE_KEY, JSON.stringify(s));

function readSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SETTING_KEYS) {
    const v = store.get(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

/** เขียนการตั้งค่าจากเครื่องอื่นลงเครื่องนี้ แล้วให้แต่ละส่วนใช้ค่าใหม่ทันที */
function applySettings(values: Record<string, string>) {
  for (const k of SETTING_KEYS) {
    if (typeof values[k] !== 'string') continue;
    if (k === 'bs-deck-acc') {
      // ของตกแต่งเด็ค (ปลอกการ์ด/กล่องเด็ค) เก็บเป็นก้อนเดียวต่อเด็ค: รวมรายเด็ค ไม่ทับทั้งก้อน
      // (เดิมล็อกอินอีกเครื่อง = ของตกแต่งของเด็คที่จัดในเครื่องนี้หายไปทั้งหมด) · เด็คเดียวกัน = ของเครื่องที่แก้ล่าสุดชนะ
      const parse = (v: string | null) => {
        try {
          const o = v ? (JSON.parse(v) as unknown) : {};
          return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      };
      store.set(k, JSON.stringify({ ...parse(store.get(k)), ...parse(values[k]!) }));
      continue;
    }
    if (k === 'bs-exp') {
      // EXP ไม่มีวันลด: รวมสองเครื่อง = ค่าที่มากกว่า
      store.set(k, mergeExpJson(store.get(k), values[k]!));
      continue;
    }
    store.set(k, values[k]!);
  }
  const json = <T>(k: string): T | null => {
    try {
      return values[k] ? (JSON.parse(values[k]) as T) : null;
    } catch {
      return null;
    }
  };
  const p = json<Partial<Prefs>>('bs-play-prefs');
  if (p) setPrefs(p);
  const s = json<{ on: boolean; volume: number }>('bs-sfx');
  if (s) setSfx(s);
  const b = json<{ on: boolean; volume: number }>('bs-bgm');
  if (b) setBgmSettings(b);
  if (values['bs-gfx']) reloadGfx();
  if (values['bs-tutorial']) reloadTutorialProgress();
  if (values['bs-solo']) reloadSoloProgress();
  if (values['bs-exp']) reloadLevel();
  const cut = values['bs-cutin'];
  if (cut === 'always' || cut === 'first' || cut === 'off') useGame.getState().setCutIn(cut as CutInMode);
}

const toSync = (d: SavedDeck): SyncDeck => ({ id: d.id, code: encodeDeck(d.name, d.entries), updated: d.updated });
function fromSync(d: SyncDeck): SavedDeck | null {
  const x = decodeDeck(d.code);
  return x ? { id: d.id, name: x.label, entries: x.entries, updated: d.updated } : null;
}

/** Player ID 9 หลักจาก uid (อ่านง่าย ใช้อ้างอิงบัญชี: หน้าไตเติล / ป้ายโปรไฟล์ / หน้าบัญชี) */
export function playerId(uid: string): string {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 16777619) >>> 0;
  const n = String(h % 1_000_000_000).padStart(9, '0');
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
}

const localProfile = () => ({ name: useGame.getState().playerName, avatar: store.get(AVATAR_KEY) ?? '' });
const profileHash = (p: { name: string; avatar: string }) => JSON.stringify([p.name, p.avatar]);

// ---------------------------------------------------------------- store

export interface AccountState {
  /** รู้สถานะล็อกอินแล้ว (ก่อนหน้านั้นอย่าเพิ่งโชว์ปุ่มล็อกอิน) */
  ready: boolean;
  user: CloudUser | null;
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
  /** รูปโปรไฟล์ (รหัสการ์ด) · ว่าง = ใช้รูปเริ่มต้น */
  avatar: string;
  /** เพิ่มทุกครั้งที่ดึงข้อมูลจากคลาวด์ลงเครื่อง: หน้าที่แสดงเด็คใช้รีเฟรช */
  pulledAt: number;
  backend: string;
}

export const useAccount = create<AccountState>(() => ({
  ready: false,
  user: null,
  syncing: false,
  lastSync: null,
  error: null,
  avatar: store.get(AVATAR_KEY) ?? '',
  pulledAt: 0,
  backend: cloud.name,
}));

/** ซิงก์ที่กำลังทำอยู่ (เรียกซ้ำระหว่างทำ = รอตัวเดิมจบ) */
let running: Promise<void> | null = null;

/** ซิงก์เต็มสองทาง: ดึงจากคลาวด์ รวมกับในเครื่อง แล้วส่งส่วนที่ในเครื่องใหม่กว่าขึ้นไป */
function sync(uid: string): Promise<void> {
  running ??= doSync(uid).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(uid: string) {
  useAccount.setState({ syncing: true, error: null });
  try {
    const data = await cloud.load(uid);
    const st = readState();
    const same = st?.uid === uid;
    const now = Date.now();

    const decks = mergeDecks(loadMyDecks().map(toSync), data.decks, same ? st.known : {}, now);
    replaceMyDecks(decks.local.map(fromSync).filter((d): d is SavedDeck => !!d));
    await Promise.all(Object.entries(decks.push).map(([id, d]) => cloud.saveDeck(uid, id, d)));

    const settings = mergeSettings(readSettings(), data.settings, same ? st.settings : null, now);
    if (settings.apply) applySettings(settings.apply);
    if (settings.push) await cloud.saveSettings(uid, settings.push);

    // โปรไฟล์: ล็อกอินครั้งแรกในเครื่องนี้ = ใช้ของบัญชี (ถ้ามี) · หลังจากนั้นแก้ล่าสุดชนะ
    const mine = localProfile();
    const changed = !same || profileHash(mine) !== st.profile;
    let profile: CloudProfile;
    if (data.profile && (!same || !changed) && (!same || data.profile.updated > st.profileUpdated)) {
      profile = data.profile;
      useGame.getState().setPlayerName(profile.name);
      store.set(AVATAR_KEY, profile.avatar);
      useAccount.setState({ avatar: profile.avatar });
    } else if (changed || !data.profile) {
      profile = { ...mine, updated: now };
      await cloud.saveProfile(uid, profile);
    } else {
      profile = data.profile;
    }

    writeState({ uid, known: decks.known, settings: settings.state, profile: profileHash(localProfile()), profileUpdated: profile.updated });
    useAccount.setState((s) => ({ lastSync: Date.now(), pulledAt: s.pulledAt + 1 }));
  } catch (e) {
    useAccount.setState({ error: e instanceof AccountError ? e.message : 'ซิงก์ไม่สำเร็จ: จะลองใหม่อัตโนมัติ' });
  } finally {
    useAccount.setState({ syncing: false });
  }
}

let pushing = false;
/** ส่งสิ่งที่เปลี่ยนในเครื่องขึ้นคลาวด์ (เด็ค / การตั้งค่า / โปรไฟล์) */
async function push(uid: string) {
  const st = readState();
  if (running || pushing || !st || st.uid !== uid) return;
  const now = Date.now();
  const decks = loadMyDecks();
  const deckWrites: [string, Parameters<CloudBackend['saveDeck']>[2]][] = [];
  const known = { ...st.known };
  for (const d of decks) {
    if (known[d.id] === d.updated) continue;
    deckWrites.push([d.id, { code: toSync(d).code, updated: d.updated }]);
    known[d.id] = d.updated;
  }
  for (const id of Object.keys(known)) {
    if (decks.some((d) => d.id === id)) continue;
    deckWrites.push([id, { deleted: true, updated: now }]);
    delete known[id];
  }
  const values = readSettings();
  const hash = settingsHash(values);
  const settingsChanged = hash !== st.settings?.hash;
  const prof = localProfile();
  const profChanged = profileHash(prof) !== st.profile;
  if (deckWrites.length === 0 && !settingsChanged && !profChanged) return;

  pushing = true;
  useAccount.setState({ syncing: true });
  try {
    await Promise.all(deckWrites.map(([id, d]) => cloud.saveDeck(uid, id, d)));
    if (settingsChanged) await cloud.saveSettings(uid, { values, updated: now });
    if (profChanged) await cloud.saveProfile(uid, { ...prof, updated: now });
    writeState({
      ...st,
      known,
      settings: settingsChanged ? { hash, updated: now } : st.settings,
      profile: profChanged ? profileHash(prof) : st.profile,
      profileUpdated: profChanged ? now : st.profileUpdated,
    });
    useAccount.setState({ lastSync: Date.now(), error: null });
  } catch {
    // ไม่บันทึกสถานะ = รอบหน้าส่งใหม่
    useAccount.setState({ error: 'ซิงก์ไม่สำเร็จ: จะลองใหม่อัตโนมัติ' });
  } finally {
    pushing = false;
    useAccount.setState({ syncing: false });
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
function startSync(uid: string) {
  stopSync();
  void sync(uid);
  timer = setInterval(() => void push(uid), PUSH_MS);
}
function stopSync() {
  if (timer) clearInterval(timer);
  timer = null;
}

let installed = false;
/** เรียกครั้งเดียวตอนเปิดแอป */
export function installAccount() {
  if (installed) return;
  installed = true;
  try {
    cloud.onUser(
      (user) => {
        const prev = useAccount.getState().user;
        useAccount.setState({ ready: true, user, ...(user ? { error: null } : {}) });
        if (!user) return stopSync();
        if (prev?.uid !== user.uid) startSync(user.uid);
      },
      // กลับมาจากล็อกอินแบบเปลี่ยนหน้าแล้วไม่สำเร็จ: แสดงที่หน้าล็อกอิน
      (message) => useAccount.setState({ error: message }),
    );
  } catch {
    // ตั้งค่า Firebase ไม่ครบ: ใช้แบบไม่ล็อกอิน
    useAccount.setState({ ready: true });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      const u = useAccount.getState().user;
      if (!document.hidden && u) void sync(u.uid);
    });
  }
}

// ---------------------------------------------------------------- คำสั่งจากหน้าจอ

async function run(f: () => Promise<void>): Promise<boolean> {
  useAccount.setState({ error: null });
  try {
    await f();
    return true;
  } catch (e) {
    useAccount.setState({ error: e instanceof AccountError ? e.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
    return false;
  }
}

export const account = {
  signInGoogle: () => run(() => cloud.signInGoogle()),
  signInEmail: (email: string, password: string) => run(() => cloud.signInEmail(email, password)),
  signUpEmail: (email: string, password: string) => run(() => cloud.signUpEmail(email, password)),
  resetPassword: (email: string) => run(() => cloud.resetPassword(email)),
  signOut: () =>
    run(async () => {
      // ส่งสิ่งที่ค้างก่อนออก (ถ้าทำได้)
      const u = useAccount.getState().user;
      if (u) await push(u.uid).catch(() => {});
      stopSync();
      await cloud.signOut();
    }),
  /** เลือกรูปโปรไฟล์ (ซิงก์รอบถัดไปถ้าล็อกอินอยู่) */
  setAvatar(cardNo: string) {
    store.set(AVATAR_KEY, cardNo);
    useAccount.setState({ avatar: cardNo });
  },
  /** ซิงก์ตอนนี้ (ปุ่มในหน้าบัญชีที่เปิดจากหน้าไตเติลเท่านั้น) */
  syncNow: (): Promise<void> => {
    const u = useAccount.getState().user;
    return u ? sync(u.uid) : Promise.resolve();
  },
};
