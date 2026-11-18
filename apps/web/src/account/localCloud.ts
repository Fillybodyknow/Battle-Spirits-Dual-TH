/**
 * บัญชี + คลาวด์จำลองในเครื่อง (?online=local หรือยังไม่ได้ตั้งค่า Firebase): ทดสอบการล็อกอิน/ซิงก์โดยไม่ต้องมีเน็ต
 * ทุกอย่างเก็บใน localStorage คีย์ bs-local-cloud · "Google" = บัญชีทดสอบตายตัว
 */
import { AccountError, type CloudBackend, type CloudData, type CloudUser } from './cloud';

const KEY = 'bs-local-cloud';
interface Store {
  accounts: Record<string, { password: string; uid: string }>;
  session: CloudUser | null;
  data: Record<string, CloudData>;
}

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null;
    if (s && typeof s === 'object') return { accounts: s.accounts ?? {}, session: s.session ?? null, data: s.data ?? {} };
  } catch {
    /* ข้อมูลเสีย: เริ่มใหม่ */
  }
  return { accounts: {}, session: null, data: {} };
}
function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

const listeners = new Set<(u: CloudUser | null) => void>();
function setSession(user: CloudUser | null) {
  const s = read();
  s.session = user;
  write(s);
  listeners.forEach((f) => f(user));
}
const data = (s: Store, uid: string): CloudData => (s.data[uid] ??= { profile: null, decks: {}, settings: null });
const delay = () => new Promise((r) => setTimeout(r, 150));

export const localCloud: CloudBackend = {
  name: 'ในเครื่อง (ทดสอบ)',

  onUser(cb) {
    listeners.add(cb);
    cb(read().session);
    return () => void listeners.delete(cb);
  },

  async signInGoogle() {
    await delay();
    setSession({ uid: 'local-google', email: 'tester@gmail.local', provider: 'google' });
  },

  async signInEmail(email, password) {
    await delay();
    const acc = read().accounts[email.trim().toLowerCase()];
    if (!acc || acc.password !== password) throw new AccountError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    setSession({ uid: acc.uid, email: email.trim().toLowerCase(), provider: 'password' });
  },

  async signUpEmail(email, password) {
    await delay();
    const key = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) throw new AccountError('รูปแบบอีเมลไม่ถูกต้อง');
    if (password.length < 6) throw new AccountError('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
    const s = read();
    if (s.accounts[key]) throw new AccountError('อีเมลนี้สมัครไว้แล้ว: กด "เข้าสู่ระบบ" แทน');
    const uid = `local-${Date.now().toString(36)}`;
    s.accounts[key] = { password, uid };
    write(s);
    setSession({ uid, email: key, provider: 'password' });
  },

  async resetPassword(email) {
    await delay();
    if (!read().accounts[email.trim().toLowerCase()]) throw new AccountError('ไม่พบบัญชีอีเมลนี้');
  },

  async signOut() {
    setSession(null);
  },

  async load(uid) {
    await delay();
    return structuredClone(data(read(), uid));
  },

  async saveProfile(uid, profile) {
    const s = read();
    data(s, uid).profile = profile;
    write(s);
  },

  async saveDeck(uid, id, deck) {
    const s = read();
    data(s, uid).decks[id] = deck.deleted ? { deleted: true, updated: deck.updated } : { code: deck.code ?? '', updated: deck.updated };
    write(s);
  },

  async saveSettings(uid, settings) {
    const s = read();
    data(s, uid).settings = settings;
    write(s);
  },
};
